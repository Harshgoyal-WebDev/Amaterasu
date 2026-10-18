"use client";

import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { COLORS, ENV_MATERIAL, ENV_MODEL, KNOBS, RUNES, SOUNDWAVE, getEnvPlacement } from "../config";
import { useConfigVersion } from "../controls/configStore";
import { createEnvironmentUniforms, patchEnvironmentMaterial } from "../materials/environmentMaterial";

// Shared by every patched program (and across tier switches).
const uniforms = createEnvironmentUniforms();
const runeRotation = new THREE.Matrix4();

function syncUniforms(placement) {
  const u = uniforms;
  u.uRoughnessRange.value.set(...ENV_MATERIAL.roughnessRange);
  u.uWetHeight.value = ENV_MATERIAL.wetHeight;
  u.uWetDarken.value = ENV_MATERIAL.wetDarken;
  u.uWetRoughness.value = ENV_MATERIAL.wetRoughness;

  // World → model axes (unscaled, so rune sizes stay in metres).
  u.uRuneSpace.value
    .makeTranslation(...placement.position)
    .multiply(runeRotation.makeRotationY(placement.rotationY))
    .invert();
  u.uRuneColor.value.set(COLORS.rune);
  u.uRuneCore.value.set(COLORS.runeCore);
  u.uRuneSize.value = RUNES.size;
  u.uRuneCell.value.set(...RUNES.spacing);
  u.uRuneStroke.value = RUNES.stroke;
  u.uRuneGaps.value = RUNES.gaps;
  u.uRuneIntensity.value = RUNES.intensity * KNOBS.runeIntensity;
  u.uRuneHalo.value = RUNES.halo;
  u.uRuneShimmer.value = RUNES.shimmer;
  u.uRuneSurface.value = RUNES.surfaceGlow * KNOBS.runeIntensity;
  u.uRunePulse.value = SOUNDWAVE.runeIntensity * KNOBS.soundwaveIntensity;
}

/**
 * The artist's environment GLB (portal + rocks), placed so its aperture lands
 * on ENV_MODEL.anchor and its waterline on y = 0. Meshopt-compressed; the
 * tier picks the lighter mobile export. Its material gets the stone tweaks
 * and the hover runes (materials/environmentMaterial.js).
 */
export default function EnvironmentModel({ tier }) {
  const { scene } = useGLTF(ENV_MODEL.url[tier], false, true);
  // Re-renders (and resyncs) when the panel edits any of these sections.
  const version = useConfigVersion("ENV_MODEL", "ENV_MATERIAL", "RUNES", "COLORS", "KNOBS", "SOUNDWAVE");
  const placement = getEnvPlacement();

  useEffect(() => {
    syncUniforms(getEnvPlacement());
    scene.traverse((object) => {
      if (!object.isMesh) return;
      patchEnvironmentMaterial(object.material, uniforms);
      object.material.envMapIntensity = ENV_MATERIAL.envMapIntensity;
    });
  }, [scene, version]);

  return (
    <primitive
      object={scene}
      position={placement.position}
      rotation-y={placement.rotationY}
      scale={placement.scale}
    />
  );
}
