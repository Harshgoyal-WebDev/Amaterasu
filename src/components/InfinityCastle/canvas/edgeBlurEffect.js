import { Effect, EffectAttribute } from "postprocessing";
import { Uniform } from "three";

/**
 * Radial (zoom) blur that leaves the centre of the view sharp and smears the
 * edges towards it — speed lines. `strength` 0..1, `inner` is the radius
 * (0 centre … 1 corner) where it begins. Samples are jittered per pixel so
 * the streaks don't band.
 */
const fragmentShader = /* glsl */ `
uniform float strength;
uniform float inner;
uniform float stretch;

float icHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 d = uv - 0.5;
  vec2 a = vec2(aspect, 1.0);
  float r = length(d * a) / length(a * 0.5);
  float amt = strength * smoothstep(inner, 1.0, r);
  if (amt < 0.002) {
    outputColor = inputColor;
    return;
  }
  float j = icHash(uv * resolution);
  vec3 acc = inputColor.rgb;
  for (int i = 1; i <= SAMPLES; i++) {
    float t = (float(i) - j) / float(SAMPLES);
    acc += texture2D(inputBuffer, 0.5 + d * (1.0 - amt * stretch * t)).rgb;
  }
  outputColor = vec4(acc / float(SAMPLES + 1), inputColor.a);
}
`;

export class EdgeBlurEffect extends Effect {
  constructor({ samples = 8, stretch = 0.2 } = {}) {
    super("EdgeBlurEffect", fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION,
      defines: new Map([["SAMPLES", String(samples)]]),
      uniforms: new Map([
        ["strength", new Uniform(0)],
        ["inner", new Uniform(0.45)],
        ["stretch", new Uniform(stretch)],
      ]),
    });
  }
}
