"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ATMOSPHERE, COLORS, getLensWorldPosition } from "../config";
import { useConfigVersion } from "../controls/configStore";
import { heroState } from "../heroState";
import { createMistMaterial } from "../materials/mistMaterial";

// Shared by every mist card — one write per frame updates them all.
const SHARED_UNIFORMS = {
  uTime: { value: 0 },
  uGlobalOpacity: { value: 1 },
  uGlowStrength: { value: 1 },
};

/**
 * Low-lying mist: a handful of large soft cards near the water. Combined with
 * exp² fog this reads as volumetric haze without any raymarching.
 */
export default function Atmosphere({ tier }) {
  // Panel edits remount the cards — cheap, they share one compiled program.
  const version = useConfigVersion("ATMOSPHERE", "COLORS", "ENV_MODEL", "LENS");
  return <MistLayers key={version} tier={tier} />;
}

function MistLayers({ tier }) {
  const { geometry, layers } = useMemo(() => {
    const layers = ATMOSPHERE.layers
      .filter((layer) => tier === "high" || layer.tier !== "high")
      .map((layer) => ({
        ...layer,
        material: createMistMaterial({
          color: COLORS.mist,
          glowColor: COLORS.mistGlow,
          glowPosition: getLensWorldPosition(),
          glowRadius: ATMOSPHERE.glowRadius,
          opacity: layer.opacity,
          nearFade: ATMOSPHERE.nearFade,
          shared: SHARED_UNIFORMS,
        }),
      }));
    // Base at y = 0 so a card rises from its position.
    const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    return { geometry, layers };
  }, [tier]);

  useEffect(
    () => () => {
      geometry.dispose();
      layers.forEach((layer) => layer.material.dispose());
    },
    [geometry, layers],
  );

  useFrame(({ clock }) => {
    SHARED_UNIFORMS.uTime.value = clock.elapsedTime * ATMOSPHERE.driftSpeed;
    SHARED_UNIFORMS.uGlobalOpacity.value = heroState.mist;
    SHARED_UNIFORMS.uGlowStrength.value = heroState.lensGlow;
  });

  return layers.map((layer, i) => (
    <mesh
      key={i}
      geometry={geometry}
      material={layer.material}
      position={layer.position}
      scale={[layer.size[0], layer.size[1], 1]}
      renderOrder={1}
    />
  ));
}
