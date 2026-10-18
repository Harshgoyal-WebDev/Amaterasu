import * as THREE from "three";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";

/**
 * The cursor's fluid as clear liquid glass (post-processing pass).
 *
 * The heavy work (slope of the liquid, surface normal, highlight)
 * is precomputed by the fluid solver into a small "glass field" texture at
 * fluid resolution (FluidSim.computeGlass). Per screen pixel this pass only:
 *   - reads the field once (and stops there if there's no liquid),
 *   - refracts the scene with chromatic dispersion (3 reads),
 *   - adds the highlight, rim glint and (optionally) a mirrored glint (1 read).
 *
 * The same pass also carries the journey's motion effects, folded in here to
 * keep the post chain at its existing number of passes:
 *   uWarp   portal crossing (a moment of the scroll): radial stretch, a short
 *           radial blur, RGB separation growing towards the edges
 *   uSpeed  falling through the void: radial motion blur + a little RGB
 *           split on the edges of the screen only (the centre stays sharp)
 *   uChroma / uEdgeBlur  in the void at rest too: edge RGB split + soft
 *           lens blur towards the screen edges
 * The cursor's liquid glass still renders on top of either.
 */
const fragment = /* glsl */ `
uniform sampler2D tGlass;    // xy offset, z highlight, w edge
uniform float uEnabled;
uniform float uChromatic;
uniform float uReflection;
uniform float uMirror;
uniform float uMirrorK;
uniform float uRim;
uniform vec3  uHighlight;
uniform vec3  uRimColor;
uniform float uWarp;
uniform float uStretch;
uniform float uSplit;
uniform float uBlur;
uniform float uSpeed;
uniform float uSpeedBlur;
uniform float uSpeedSplit;
uniform float uChroma;   // constant edge RGB split (in the void)
uniform float uEdgeBlur; // px: soft lens blur towards the edges (in the void)

#define WARP_TAPS 8
vec3 warped(vec2 uv) {
  vec2 c = uv - 0.5;
  float r2 = dot(c, c) * 4.0; // 0 centre → ~2 corners
  float rim = smoothstep(0.12, 1.0, r2); // speed effects leave the centre sharp
  vec2 base = 0.5 + c * (1.0 - uStretch * uWarp * r2 * 0.5);
  float blur = uBlur * uWarp + uSpeedBlur * uSpeed * rim;
  vec2 dir = c * blur;
  vec2 split = c * (uSplit * uWarp * r2 + (uSpeedSplit * uSpeed + uChroma) * rim);
  float soft = uEdgeBlur * rim; // px
  if (blur < 1e-4 && soft < 0.25) // RGB split only: 3 reads
    return vec3(texture2D(inputBuffer, base + split).r, texture2D(inputBuffer, base).g, texture2D(inputBuffer, base - split).b);
  vec3 col = vec3(0.0);
  for (int i = 0; i < WARP_TAPS; i++) {
    float fi = float(i);
    // radial motion blur along dir + a Vogel-disk lens blur of radius soft
    float a = fi * 2.39996;
    vec2 disk = vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / float(WARP_TAPS)) * soft * texelSize;
    vec2 p = base - dir * (fi / float(WARP_TAPS - 1)) + disk;
    col += vec3(texture2D(inputBuffer, p + split).r, texture2D(inputBuffer, p).g, texture2D(inputBuffer, p - split).b);
  }
  return col / float(WARP_TAPS);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 col = uWarp + uSpeed + uChroma + uEdgeBlur > 1e-5 ? warped(uv) : inputColor.rgb;
  if (uEnabled < 0.5) { outputColor = vec4(col, inputColor.a); return; }
  vec4 g = texture2D(tGlass, uv);
  vec2 bend = g.xy;
  if (dot(bend, bend) < 1e-10 && g.z + g.w < 1e-4) { outputColor = vec4(col, inputColor.a); return; }

  // dispersion: red bends least, blue most (the liquid sits on the lens, so
  // it refracts the sharp image even while the edges are motion-blurred)
  vec3 refr = vec3(
    texture2D(inputBuffer, uv + bend * (1.0 - uChromatic)).r,
    texture2D(inputBuffer, uv + bend).g,
    texture2D(inputBuffer, uv + bend * (1.0 + uChromatic)).b
  );
  col = mix(col, refr, smoothstep(0.0, 0.002, length(bend)));
  col += uHighlight * g.z * uReflection;
  col += uRimColor * pow(g.w, 1.5) * uRim;
  if (uMirror > 0.0 && g.w > 0.001) {
    vec2 m = clamp(-bend * uMirrorK, vec2(-0.2), vec2(0.2));
    col += texture2D(inputBuffer, uv + m).rgb * g.w * uMirror;
  }
  outputColor = vec4(col, inputColor.a);
}
`;

export class FluidGlassEffect extends Effect {
  constructor() {
    super("FluidGlassEffect", fragment, {
      blendFunction: BlendFunction.SRC,
      // samples the input at offsets → must run in its own pass
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([
        ["tGlass", new THREE.Uniform(null)],
        ["uEnabled", new THREE.Uniform(0)],
        ["uChromatic", new THREE.Uniform(0.4)],
        ["uReflection", new THREE.Uniform(0.5)],
        ["uMirror", new THREE.Uniform(0.3)],
        ["uMirrorK", new THREE.Uniform(10)],
        ["uRim", new THREE.Uniform(0.2)],
        ["uHighlight", new THREE.Uniform(new THREE.Color("#ffffff"))],
        ["uRimColor", new THREE.Uniform(new THREE.Color("#b65cff"))],
        ["uWarp", new THREE.Uniform(0)],
        ["uStretch", new THREE.Uniform(0.1)],
        ["uSplit", new THREE.Uniform(0.01)],
        ["uBlur", new THREE.Uniform(0.05)],
        ["uSpeed", new THREE.Uniform(0)],
        ["uSpeedBlur", new THREE.Uniform(0.06)],
        ["uSpeedSplit", new THREE.Uniform(0.006)],
        ["uChroma", new THREE.Uniform(0)],
        ["uEdgeBlur", new THREE.Uniform(0)],
      ]),
    });
  }

  /** Journey motion: portal warp 0..1, fall speed 0..1, base edge split (+ WARP / VOID). */
  syncWarp(amount, speed, chroma, edgeBlur, { stretch, chromatic, blur }, { speedBlur, speedChromatic }) {
    const u = this.uniforms;
    u.get("uEdgeBlur").value = edgeBlur;
    u.get("uWarp").value = amount;
    u.get("uSpeed").value = speed;
    u.get("uChroma").value = chroma;
    u.get("uSpeedBlur").value = speedBlur;
    u.get("uSpeedSplit").value = speedChromatic;
    u.get("uStretch").value = stretch;
    u.get("uSplit").value = chromatic;
    u.get("uBlur").value = blur;
  }

  /** Pull the latest glass field + live settings (called every frame). */
  sync(fluid, settings) {
    const u = this.uniforms;
    u.get("tGlass").value = fluid.glass;
    u.get("uEnabled").value = settings.enabled && fluid.glass && fluid.awake ? 1 : 0;
    u.get("uChromatic").value = settings.chromatic;
    u.get("uReflection").value = settings.reflection;
    u.get("uMirror").value = settings.mirror;
    // mirrored glint offset ≈ surface normal, recovered from the refraction offset
    u.get("uMirrorK").value = (settings.normalScale * 1.2) / Math.max(settings.refraction, 1e-3);
    u.get("uRim").value = settings.rim;
    u.get("uHighlight").value.set(settings.highlightColor);
    u.get("uRimColor").value.set(settings.rimColor);
  }
}
