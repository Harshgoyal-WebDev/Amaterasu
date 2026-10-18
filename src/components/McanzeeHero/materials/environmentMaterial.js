import * as THREE from "three";
import { FX_UNIFORMS } from "../fx";

/**
 * Uniforms for the patched environment material. Created once and shared by
 * reference with every patched program, so syncing a value here updates the
 * model live (see EnvironmentModel).
 */
export function createEnvironmentUniforms() {
  return {
    uRoughnessRange: { value: new THREE.Vector2(0.5, 0.9) },
    uWetHeight: { value: 1 },
    uWetDarken: { value: 0.5 },
    uWetRoughness: { value: 0.2 },
    // Runes
    uRuneSpace: { value: new THREE.Matrix4() }, // world → model axes (metres)
    uRuneColor: { value: new THREE.Color() },
    uRuneCore: { value: new THREE.Color() },
    uRuneSize: { value: 1 },
    uRuneCell: { value: new THREE.Vector2(0.75, 1.45) },
    uRuneStroke: { value: 0.05 },
    uRuneGaps: { value: 0.25 },
    uRuneIntensity: { value: 1 },
    uRuneHalo: { value: 0.7 },
    uRuneShimmer: { value: 0.3 },
    uRuneSurface: { value: 0.3 },
    uRunePulse: { value: 1 },
  };
}

const RUNES_GLSL = /* glsl */ `
  float runeHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float runeSeg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
  }

  // Distance to a Futhark-style glyph in its box (x 0..0.6, y 0..1): a stave
  // plus branches picked from the seed — reads as an alphabet, never repeats.
  float runeGlyph(vec2 p, float seed) {
    float a = fract(seed * 7.13), b = fract(seed * 13.7), c = fract(seed * 29.3);
    float e = fract(seed * 53.1), f = fract(seed * 97.7);
    float d;
    if (f > 0.84) {
      // Twin staves with crossing strokes (ᛗ / ᛞ / ᛖ).
      d = min(runeSeg(p, vec2(0.0, 0.0), vec2(0.0, 1.0)), runeSeg(p, vec2(0.6, 0.0), vec2(0.6, 1.0)));
      d = min(d, runeSeg(p, vec2(0.0, 1.0), vec2(0.6, 0.45)));
      if (a > 0.45) d = min(d, runeSeg(p, vec2(0.6, 1.0), vec2(0.0, 0.45)));
      if (b > 0.6) d = min(d, runeSeg(p, vec2(0.0, 0.45), vec2(0.6, 0.0)));
      return d;
    }
    if (f < 0.07) {
      // Ring sigil with a stave through it.
      d = abs(length(p - vec2(0.3, 0.5)) - 0.3);
      return min(d, runeSeg(p, vec2(0.3, 0.0), vec2(0.3, 1.0)));
    }
    if (f < 0.15) {
      // Diamond (ᛜ) or arrow (ᛏ).
      if (a > 0.5) {
        d = runeSeg(p, vec2(0.3, 0.05), vec2(0.6, 0.5));
        d = min(d, runeSeg(p, vec2(0.6, 0.5), vec2(0.3, 0.95)));
        d = min(d, runeSeg(p, vec2(0.3, 0.95), vec2(0.0, 0.5)));
        return min(d, runeSeg(p, vec2(0.0, 0.5), vec2(0.3, 0.05)));
      }
      d = runeSeg(p, vec2(0.3, 0.0), vec2(0.3, 1.0));
      d = min(d, runeSeg(p, vec2(0.3, 1.0), vec2(0.0, 0.7)));
      return min(d, runeSeg(p, vec2(0.3, 1.0), vec2(0.6, 0.7)));
    }
    d = runeSeg(p, vec2(0.15, 0.0), vec2(0.15, 1.0)); // stave
    if (a > 0.3) d = min(d, runeSeg(p, vec2(0.15, 1.0), vec2(0.55, 0.78)));      // upper flag (ᚠ ᚨ)
    if (b > 0.5) d = min(d, runeSeg(p, vec2(0.15, 0.72), vec2(0.55, 0.5)));      // lower flag
    if (c > 0.72) d = min(d, runeSeg(p, vec2(0.0, 0.68), vec2(0.6, 0.32)));      // cross stroke (ᚾ)
    if (a < 0.22) {                                                              // bowl (ᚦ ᚱ ᚹ)
      d = min(d, runeSeg(p, vec2(0.15, 0.95), vec2(0.52, 0.74)));
      d = min(d, runeSeg(p, vec2(0.52, 0.74), vec2(0.15, 0.52)));
      if (b < 0.4) d = min(d, runeSeg(p, vec2(0.2, 0.52), vec2(0.55, 0.0)));     // leg (ᚱ)
    }
    if (e > 0.82) d = min(d, runeSeg(p, vec2(0.15, 0.32), vec2(0.55, 0.0)));     // foot
    if (e < 0.12) d = min(d, runeSeg(p, vec2(0.15, 0.5), vec2(0.55, 0.92)));     // up-branch (ᛉ)
    return d;
  }

  // Glow of the inscription on one projection plane. uv in metres.
  // Returns (glyph intensity, per-glyph random).
  vec2 runeField(vec2 uv, float reveal, float px) {
    vec2 cellSize = uRuneCell * uRuneSize;
    vec2 cell = floor(uv / cellSize);
    vec2 f = fract(uv / cellSize);
    float rnd = runeHash(cell + 17.0);
    if (runeHash(cell * 1.7 + 3.1) < uRuneGaps) return vec2(0.0, rnd);
    // Glyph box: centred in the cell, one glyph-height tall.
    vec2 boxOrigin = (vec2(1.0) - vec2(0.6, 1.0) / uRuneCell) * 0.5;
    vec2 p = (f - boxOrigin) * uRuneCell;
    float d = runeGlyph(p, rnd);
    float aa = px / uRuneSize; // one pixel, in glyph heights
    float core = 1.0 - smoothstep(uRuneStroke - aa, uRuneStroke + aa, d);
    // Tight glow that dies well inside the cell, so no tile edges show.
    float outside = max(d - uRuneStroke, 0.0);
    float halo = exp(-outside * 22.0) * (1.0 - smoothstep(0.06, 0.16, outside)) * uRuneHalo;
    // Each glyph switches on at its own threshold → letters appear one by one.
    float on = smoothstep(rnd * 0.7, rnd * 0.7 + 0.3, reveal);
    return vec2((core + halo) * on, rnd);
  }
`;

/**
 * Patches the GLB's own MeshStandardMaterial in place (its baked textures stay
 * the source of colour / roughness / normal detail). Additions:
 *
 *  - roughness remapped out of the bake's near-mirror range;
 *  - darker, glossier "wet" band just above the lake surface (y = 0);
 *  - runic inscriptions: glyphs projected along the model's own axes
 *    (triplanar, sharp blend) that reveal one by one inside a cone around
 *    the cursor ray, shimmer, and flare when the soundwave ring passes.
 *
 * Idempotent — useGLTF caches the scene, so it may be handed the same
 * material more than once.
 */
export function patchEnvironmentMaterial(material, uniforms) {
  if (material.userData.mcanzeePatched) return material;
  material.userData.mcanzeePatched = true;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, FX_UNIFORMS);

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        uniform mat4 uRuneSpace;
        varying vec3 vEnvWorld;
        varying vec3 vRunePos;
        varying vec3 vRuneNormal;`,
      )
      .replace(
        "#include <project_vertex>",
        /* glsl */ `#include <project_vertex>
        vEnvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vRunePos = (uRuneSpace * vec4(vEnvWorld, 1.0)).xyz;
        vRuneNormal = mat3(uRuneSpace) * inverseTransformDirection(transformedNormal, viewMatrix);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        uniform vec2 uRoughnessRange;
        uniform float uWetHeight;
        uniform float uWetDarken;
        uniform float uWetRoughness;
        uniform vec3 uRuneColor;
        uniform vec3 uRuneCore;
        uniform float uRuneSize;
        uniform vec2 uRuneCell;
        uniform float uRuneStroke;
        uniform float uRuneGaps;
        uniform float uRuneIntensity;
        uniform float uRuneHalo;
        uniform float uRuneShimmer;
        uniform float uRuneSurface;
        uniform float uRunePulse;
        uniform float uFxTime;
        uniform vec3 uRayOrigin;
        uniform vec3 uRayDir;
        uniform float uHoverEnergy;
        uniform float uHoverAngle;
        uniform vec2 uPulseOrigin;
        uniform float uPulseAge;
        uniform float uPulseSpeed;
        varying vec3 vEnvWorld;
        varying vec3 vRunePos;
        varying vec3 vRuneNormal;
        ${RUNES_GLSL}`,
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        float envDry = smoothstep(0.0, uWetHeight, vEnvWorld.y);
        diffuseColor.rgb *= mix(uWetDarken, 1.0, envDry);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(uRoughnessRange.x, uRoughnessRange.y, roughnessFactor);
        roughnessFactor = mix(uWetRoughness, roughnessFactor, envDry);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
        // Cursor cone: energy widens it, so the reveal spreads while moving.
        float ang = acos(clamp(dot(normalize(vEnvWorld - uRayOrigin), uRayDir), -1.0, 1.0));
        float spread = uHoverAngle * (0.35 + 0.65 * uHoverEnergy);
        float hover = (1.0 - smoothstep(spread * 0.1, spread, ang)) * uHoverEnergy;

        // Soundwave ring expanding from the portal.
        float ringR = uPulseAge * uPulseSpeed;
        float ring = exp(-pow((distance(vEnvWorld.xz, uPulseOrigin) - ringR) / 3.0, 2.0))
          * exp(-uPulseAge * 0.3) * step(0.0, ringR);

        float reveal = max(hover, ring * uRunePulse);
        // Pixel footprint in metres (outside the branch: derivatives need
        // uniform control flow).
        float runePx = length(fwidth(vRunePos));
        if (reveal > 0.002) {
          vec3 n = abs(normalize(vRuneNormal));
          vec3 w = pow(n, vec3(8.0));
          w /= w.x + w.y + w.z;
          vec3 sn = sign(vRuneNormal);
          vec2 glyph = vec2(0.0);
          // Faces along the portal axis, faces across it, and tops.
          if (w.x > 0.02) glyph += runeField(vec2(-vRunePos.z * sn.x, vRunePos.y), reveal, runePx) * w.x;
          if (w.z > 0.02) glyph += runeField(vec2(vRunePos.x * sn.z, vRunePos.y), reveal, runePx) * w.z;
          if (w.y > 0.02) glyph += runeField(vec2(vRunePos.x, -vRunePos.z * sn.y), reveal, runePx) * w.y;
          float shimmer = 1.0 - uRuneShimmer * (0.5 + 0.5 * sin(uFxTime * 2.3 + glyph.y * 40.0));
          float g = glyph.x * shimmer * uRuneIntensity;
          // Halo in the rune colour, white-hot only along the stroke centre.
          vec3 runeLight = mix(uRuneColor, uRuneCore, smoothstep(0.75, 1.0, glyph.x) * 0.7);
          totalEmissiveRadiance += runeLight * g;
          totalEmissiveRadiance += uRuneColor * hover * hover * uRuneSurface;
        }`,
      );
  };
  material.customProgramCacheKey = () => "mcanzee-env-runes";
  material.needsUpdate = true;
  return material;
}
