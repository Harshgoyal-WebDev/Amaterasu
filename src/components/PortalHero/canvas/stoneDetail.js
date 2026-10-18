import * as THREE from "three";
import { STONE } from "../config";
import { getNoiseTexture } from "./noiseTexture";

/**
 * Detail pass for the GLB's masonry, ground and rock materials, patched into
 * three's own physical shader (no extra pass, no new textures). The baked
 * roughness maps are tiny and nearly uniform, so this adds, in world space:
 *   - roughness variation across the stones,
 *   - fine procedural relief (bump from the shared noise texture),
 *   - darker grooves / chipped edges, read from the existing normal maps,
 *   - patchy grime,
 *   - darker, glossier damp stone low on the walls.
 * Metal, pipes and the portal rim keep their materials untouched.
 */
export const STONE_MATERIALS = new Set([
  "MAT_Stone_Weathered",
  "MAT_Stone_Blocks",
  "MAT_Concrete_Dark",
  "MAT_Ground_Dust",
  "MAT_Rock",
]);

const uniforms = {
  tStoneNoise: { value: null },
  uRoughVar: { value: STONE.roughnessVariation },
  uBump: { value: STONE.bump },
  uCrevice: { value: STONE.crevice },
  uGrime: { value: STONE.grime },
  uDamp: { value: STONE.damp },
  uDampHeight: { value: STONE.dampHeight },
};

/** Push the live STONE values (call once per frame). */
export function syncStoneDetail() {
  uniforms.uRoughVar.value = STONE.roughnessVariation;
  uniforms.uBump.value = STONE.bump;
  uniforms.uCrevice.value = STONE.crevice;
  uniforms.uGrime.value = STONE.grime;
  uniforms.uDamp.value = STONE.damp;
  uniforms.uDampHeight.value = STONE.dampHeight;
}

const vertexHead = /* glsl */ `
varying vec3 vStoneWorld;
`;

const vertexBody = /* glsl */ `
#include <project_vertex>
{
  vec4 sp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    sp = instanceMatrix * sp;
  #endif
  vStoneWorld = (modelMatrix * sp).xyz;
}
`;

const fragmentHead = /* glsl */ `
uniform sampler2D tStoneNoise;
uniform float uRoughVar;
uniform float uBump;
uniform float uCrevice;
uniform float uGrime;
uniform float uDamp;
uniform float uDampHeight;
varying vec3 vStoneWorld;
`;

// Runs after the normal map is applied, before lighting reads diffuseColor,
// roughnessFactor and normal.
const fragmentBody = /* glsl */ `
#include <normal_fragment_maps>
{
  vec3 w = vStoneWorld;
  // cheap planar projection that works on walls and floor alike
  vec2 q = vec2(w.x + w.z, w.y + w.z * 0.37);
  float broad = texture2D(tStoneNoise, q * 0.09).r;    // stone-to-stone variation
  float grime = texture2D(tStoneNoise, q * 0.21 + 0.37).b;
  float fine = texture2D(tStoneNoise, q * 0.9).a;       // fine relief

  // roughness: varied per area
  roughnessFactor *= mix(1.0 - uRoughVar, 1.0 + uRoughVar, broad);

  // grooves and chipped edges: where the baked normal tilts away
  float cavity = 0.0;
  #ifdef USE_NORMALMAP_TANGENTSPACE
    cavity = smoothstep(0.15, 0.6, 1.0 - clamp(normalize(mapN).z, 0.0, 1.0));
  #endif
  diffuseColor.rgb *= 1.0 - cavity * uCrevice;
  roughnessFactor = mix(roughnessFactor, 1.0, cavity * uCrevice * 0.5);

  // patchy grime
  diffuseColor.rgb *= 1.0 - smoothstep(0.45, 0.8, grime) * uGrime;

  // damp low walls / floor: darker and glossier
  float wet = (1.0 - smoothstep(0.0, max(uDampHeight, 1e-3), w.y)) * uDamp;
  diffuseColor.rgb *= 1.0 - wet * 0.4;
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, wet);
  roughnessFactor = clamp(roughnessFactor, 0.06, 1.0);

  // fine relief (bump from screen-space derivatives of the noise)
  if (uBump > 0.0) {
    vec3 sx = dFdx(-vViewPosition);
    vec3 sy = dFdy(-vViewPosition);
    vec3 r1 = cross(sy, normal);
    vec3 r2 = cross(normal, sx);
    float det = dot(sx, r1);
    vec2 dh = vec2(dFdx(fine), dFdy(fine)) * uBump * 60.0;
    vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
    normal = normalize(abs(det) * normal - grad);
  }
}
`;

/** Patch one GLB material in place (idempotent). */
export function applyStoneDetail(material) {
  if (material.userData.stoneDetail) return;
  material.userData.stoneDetail = true;
  uniforms.tStoneNoise.value ??= getNoiseTexture();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = vertexHead + shader.vertexShader.replace("#include <project_vertex>", vertexBody);
    shader.fragmentShader = fragmentHead + shader.fragmentShader.replace("#include <normal_fragment_maps>", fragmentBody);
  };
  material.customProgramCacheKey = () => "stone-detail";
  material.needsUpdate = true;
}

export const isStoneMaterial = (material) => material instanceof THREE.MeshStandardMaterial && STONE_MATERIALS.has(material.name);
