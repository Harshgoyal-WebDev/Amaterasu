"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { COLORS, INTERACTION, KNOBS, SOUNDWAVE, WATER } from "../config";
import { useConfigVersion } from "../controls/configStore";
import { FX_UNIFORMS, resizeRipples } from "../fx";
import { createWaterShader } from "../materials/waterShader";

function syncWater(mesh) {
  const u = mesh.material.uniforms;
  const { water } = INTERACTION;
  u.uDistortion.value = KNOBS.waterDistortion;
  u.uReflectivity.value = WATER.reflectivity;
  u.uBaseReflection.value = WATER.baseReflection;
  u.uWaterColor.value.set(COLORS.water);
  u.uSkyColor.value.set(COLORS.fog);
  u.uGlowColor.value.set(COLORS.glow);
  u.uRippleStrength.value = water.rippleStrength;
  u.uRippleLife.value = water.rippleLife;
  u.uRippleSpeed.value = water.rippleSpeed;
  u.uHoverGlow.value = water.hoverGlow;
  u.uPulseIntensity.value = SOUNDWAVE.waterIntensity * KNOBS.soundwaveIntensity;
  mesh.position.set(...WATER.center);
  mesh.scale.set(WATER.size, WATER.size, 1);
}

/**
 * Flat water plane. High tier: planar reflection (one extra low-res scene
 * render). Low tier: same shader, reflection replaced by a sky tint.
 * Animation + interaction come from the shared FX uniforms.
 */
export default function Water({ reflections, resolution }) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const version = useConfigVersion("COLORS", "WATER", "INTERACTION", "SOUNDWAVE", "KNOBS");
  // Loop counts are compile-time defines: changing them rebuilds the water.
  const rippleCount = INTERACTION.water.maxRipples;
  const rings = SOUNDWAVE.rings;

  const water = useMemo(() => {
    resizeRipples(rippleCount);
    const geometry = new THREE.PlaneGeometry(1, 1);
    const shader = createWaterShader({ reflections, rippleCount, rings });

    let mesh;
    if (reflections) {
      mesh = new Reflector(geometry, { shader, clipBias: 0.003, multisample: 0 });
    } else {
      mesh = new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
          uniforms: shader.uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader,
        }),
      );
    }
    // Reflector only forwards (cloned) uniforms + shaders, so set defines
    // and re-link the shared FX uniform objects afterwards.
    mesh.material.defines = { ...shader.defines };
    Object.assign(mesh.material.uniforms, FX_UNIFORMS);
    mesh.material.fog = true;
    mesh.name = "lake"; // looked up by <Lens /> (see its refraction pass)
    mesh.rotation.x = -Math.PI / 2;
    syncWater(mesh);
    return mesh;
  }, [reflections, rippleCount, rings]);

  useEffect(() => syncWater(water), [water, version]);

  // Reflection render target tracks the canvas size × a quality factor.
  useEffect(() => {
    if (!water.isReflector) return;
    water
      .getRenderTarget()
      .setSize(
        Math.max(256, Math.round(size.width * dpr * resolution)),
        Math.max(256, Math.round(size.height * dpr * resolution)),
      );
  }, [water, size, dpr, resolution]);

  useEffect(
    () => () => {
      if (water.isReflector) water.dispose();
      else water.material.dispose();
      water.geometry.dispose();
    },
    [water],
  );

  return <primitive object={water} />;
}
