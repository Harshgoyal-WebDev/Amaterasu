import * as THREE from "three";
import { BOULDER } from "../../config";

/**
 * Skill engravings + dust, patched into the monolith's own PBR material.
 *
 * Inputs (Blender bake, glTF UVs, 2048²):
 *   masks  R carved names (1) / runic trim (0.55) · G cracks · B dust · A logos
 *   clean  base colour without the dust (the GLB's base colour has it baked in)
 *   reveal low-res canvas over the front of the atlas (v 0..vMax), painted by
 *          scratching: 0 = dusty, 1 = clean
 *
 * Where revealed: clean stone, and the carved logos / names glow violet.
 * Still dusty: the carvings hold a little extra dust and breathe faintly, as
 * a hint that something is there.
 *
 * Cracks: dark at first; they light up within `uSpread` metres of the
 * boulder's centre, with a brighter front at the edge — the spread grows as
 * skills are uncovered, so the glow runs out along the cracks from the middle.
 */
export function patchBoulderMaterial(material, { masks, clean, reveal }) {
  const uniforms = {
    tMasks: { value: masks },
    tClean: { value: clean },
    tReveal: { value: reveal },
    uVMax: { value: BOULDER.front.vMax },
    uDustColor: { value: new THREE.Color(BOULDER.dustColor) },
    uGlowColor: { value: new THREE.Color(BOULDER.glowColor) },
    uGlow: { value: BOULDER.glow },
    uHint: { value: BOULDER.hint },
    uTime: { value: 0 },
    uSpread: { value: 0 }, // m
    uCrackCentre: { value: new THREE.Vector3() }, // world
    uCrackColor: { value: new THREE.Color(BOULDER.crack.color) },
    uCrackGlow: { value: BOULDER.crack.glow },
    uSeamBoost: { value: BOULDER.crack.seams },
  };
  material.emissiveIntensity = BOULDER.emissive;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBWorld;")
      .replace("#include <project_vertex>", "#include <project_vertex>\n  vBWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
uniform sampler2D tMasks;
uniform sampler2D tClean;
uniform sampler2D tReveal;
uniform float uVMax;
uniform vec3  uDustColor;
uniform vec3  uGlowColor;
uniform float uGlow;
uniform float uHint;
uniform float uTime;
uniform float uSpread;
uniform vec3  uCrackCentre;
uniform vec3  uCrackColor;
uniform float uCrackGlow;
uniform float uSeamBoost;
varying vec3  vBWorld;`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
  vec4 jMask = texture2D(tMasks, vMapUv);
  float jFront = step(vMapUv.y, uVMax);
  float jRev = jFront * texture2D(tReveal, vec2(vMapUv.x, vMapUv.y / uVMax)).r;
  float jEng = max(jMask.a, jMask.r) * jFront; // logos + names (+ faint runic trim)
  diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(tClean, vMapUv).rgb, jRev);
  diffuseColor.rgb = mix(diffuseColor.rgb, uDustColor, jMask.b * jFront * (1.0 - jRev) * 0.45);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
  // cracks light up from the centre outwards, a brighter front at the edge
  float jDist = distance(vBWorld, uCrackCentre);
  float jLit = 1.0 - smoothstep(uSpread - 0.6, uSpread, jDist);
  float jFrontGlow = exp(-pow((jDist - uSpread) / 0.35, 2.0)) * step(0.02, uSpread);
  // the baked seam glow (faint in the bake) + the surface crack network read
  // from the AO crevices — the carved skills themselves are left out
  float jAo = 1.0;
  #ifdef USE_AOMAP
    jAo = texture2D(aoMap, vAoMapUv).r;
  #endif
  float jCrack = max(jMask.g, smoothstep(0.8, 0.4, jAo)) * (1.0 - jEng);
  float jPulse = 0.85 + 0.15 * sin(uTime * 2.0 - jDist * 3.0);
  totalEmissiveRadiance *= jLit * (1.0 + jFrontGlow * 1.5) * uSeamBoost;
  totalEmissiveRadiance += uCrackColor * jCrack * (jLit + jFrontGlow * 1.2) * uCrackGlow * jPulse;
  float jBreath = 0.5 + 0.5 * sin(uTime * 1.3);
  totalEmissiveRadiance += uGlowColor * jEng * (jRev * uGlow + (1.0 - jRev) * uHint * jBreath);`,
      );
  };
  material.customProgramCacheKey = () => "skills-boulder";
  material.needsUpdate = true;
  return uniforms;
}

/** The scratch layer: a small canvas over the front of the atlas. */
export function createRevealLayer(width = 512) {
  const height = Math.round(width * BOULDER.front.vMax);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false; // canvas row 0 = v 0, same as the glTF atlas
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const radius = BOULDER.brush.radius * BOULDER.front.u[2] * width; // m → px
  const strength = BOULDER.brush.strength;
  ctx.globalCompositeOperation = "lighter"; // scratching the same spot again reveals more

  /** One dab at atlas uv (u, v), v in 0..vMax. */
  const dab = (u, v) => {
    const x = u * width;
    const y = (v / BOULDER.front.vMax) * height;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(255,255,255,${strength})`);
    g.addColorStop(0.55, `rgba(255,255,255,${strength * 0.6})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };

  return {
    texture,
    /** A stroke from (u0, v0) to (u1, v1): dabs every ~third of a radius. */
    stroke(u0, v0, u1, v1) {
      const dx = (u1 - u0) * width;
      const dy = ((v1 - v0) / BOULDER.front.vMax) * height;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (radius * 0.35)));
      for (let i = 1; i <= steps; i++) dab(u0 + ((u1 - u0) * i) / steps, v0 + ((v1 - v0) * i) / steps);
      texture.needsUpdate = true;
    },
    /** Fully reveal a rect of the atlas (u0, v0)–(u1, v1), soft-edged. */
    fill(u0, v0, u1, v1) {
      const x0 = u0 * width;
      const x1 = u1 * width;
      const y0 = (v0 / BOULDER.front.vMax) * height;
      const y1 = (v1 / BOULDER.front.vMax) * height;
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
    },
  };
}
