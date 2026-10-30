import * as THREE from "three";
import { MATERIAL_TUNING } from "../config";

/**
 * One material per name across all GLBs (every export carries its own copy of
 * the same wood / paper / lantern materials). Physical shoji paper becomes a
 * standard material — transmission would add a full extra render pass.
 * Emissive materials get a per-lantern flicker keyed on world position.
 */

export const materialUniforms = {
  uIcTime: { value: 0 },
  uIcFlicker: { value: MATERIAL_TUNING.flicker },
};

const FLICKER_NAMES = new Set(["M_Lantern_Amber_Emissive", "M_Shoji_Paper_Glow"]);

function toStandard(src) {
  if (!src.isMeshPhysicalMaterial) return src;
  const m = new THREE.MeshStandardMaterial();
  for (const k of [
    "name",
    "color",
    "map",
    "normalMap",
    "normalScale",
    "roughness",
    "roughnessMap",
    "metalness",
    "metalnessMap",
    "emissive",
    "emissiveMap",
    "emissiveIntensity",
    "side",
    "aoMap",
    "alphaMap",
    "transparent",
    "opacity",
    "alphaTest",
  ]) {
    const v = src[k];
    if (v === undefined) continue;
    if (v && v.isColor) m[k].copy(v);
    else if (v && v.isVector2) m[k].copy(v);
    else m[k] = v;
  }
  return m;
}

function patchFlicker(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uIcTime = materialUniforms.uIcTime;
    shader.uniforms.uIcFlicker = materialUniforms.uIcFlicker;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vIcWorld;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 icWorld = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          icWorld = instanceMatrix * icWorld;
        #endif
        vIcWorld = ( modelMatrix * icWorld ).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vIcWorld;\nuniform float uIcTime;\nuniform float uIcFlicker;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          vec3 cell = floor( vIcWorld * 0.6 );
          float h = fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
          float f = sin( uIcTime * ( 5.0 + h * 4.0 ) + h * 40.0 ) * 0.5
                  + sin( uIcTime * ( 13.0 + h * 9.0 ) + h * 17.0 ) * 0.3
                  + sin( uIcTime * 1.3 + h * 6.0 ) * 0.2;
          totalEmissiveRadiance *= 1.0 - uIcFlicker * ( 0.5 + 0.5 * f );
        }`,
      );
  };
  material.customProgramCacheKey = () => "ic-flicker";
}

export function createMaterialLibrary() {
  const byName = new Map();

  function tune(m) {
    m.side = THREE.DoubleSide;
    switch (m.name) {
      case "M_Lantern_Amber_Emissive":
        m.emissiveIntensity = MATERIAL_TUNING.lanternEmissive;
        break;
      case "M_Shoji_Paper_Glow":
        m.emissiveIntensity = MATERIAL_TUNING.shojiGlowEmissive;
        break;
      case "M_Shoji_Paper":
        m.roughness = 0.9;
        m.emissive = new THREE.Color("#2a1608");
        m.emissiveIntensity = 0.35;
        break;
      case "M_Background_Dark":
        break;
      default:
        break;
    }
    if (FLICKER_NAMES.has(m.name)) patchFlicker(m);
  }

  return {
    byName,
    unify(src) {
      const name = src.name || "M_Unnamed";
      const hit = byName.get(name);
      if (hit) return hit;
      const m = toStandard(src);
      m.name = name;
      tune(m);
      byName.set(name, m);
      return m;
    },
    setAnisotropy(level) {
      for (const m of byName.values())
        for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap"]) {
          if (m[k] && m[k].anisotropy !== level) {
            m[k].anisotropy = level;
            m[k].needsUpdate = true;
          }
        }
    },
    dispose() {
      // textures are owned by the GLTF cache; only our converted materials go
      for (const m of byName.values()) m.dispose();
      byName.clear();
    },
  };
}

/**
 * Background silhouettes: no scene fog (they sit 120-420 m out), their own
 * gentle distance fade instead so wrapped instances never pop.
 */
export function createBackgroundMaterial(src, fogColor) {
  const m = src.clone();
  m.fog = false;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBgFog = { value: new THREE.Color(fogColor) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vBgDist;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvBgDist = -mvPosition.z;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vBgDist;\nuniform vec3 uBgFog;")
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float bgF = 1.0 - exp( -pow( vBgDist * 0.0042, 2.0 ) );
        float bgKill = smoothstep( 330.0, 430.0, vBgDist );
        float bgNear = 1.0 - smoothstep( 105.0, 165.0, vBgDist ); // wrapped instances passing close dissolve
        gl_FragColor.rgb = mix( gl_FragColor.rgb, uBgFog, clamp( max( bgF + bgKill, bgNear ), 0.0, 1.0 ) );`,
      );
  };
  m.customProgramCacheKey = () => "ic-bg";
  return m;
}
