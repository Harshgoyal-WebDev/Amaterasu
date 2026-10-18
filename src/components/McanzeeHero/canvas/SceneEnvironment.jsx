"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { COLORS, ENVIRONMENT, KNOBS, SKY, getLensWorldPosition } from "../config";
import { useConfigVersion } from "../controls/configStore";
import { heroState } from "../heroState";
import { createSkyMaterial } from "../materials/skyMaterial";

/**
 * Sky dome + exp² fog + a tiny baked environment map for PBR reflections.
 * Fog colour equals the sky horizon, so atmospheric perspective is free:
 * the further something is, the more it dissolves into the sky.
 */
export default function SceneEnvironment() {
  const sky = useRef(null);
  const fog = useRef(null);
  const skyVersion = useConfigVersion("COLORS", "SKY");
  // The env map is baked once; any change to what it shows re-bakes it.
  const envVersion = useConfigVersion("COLORS", "ENVIRONMENT", "ENV_MODEL", "LENS");

  const skyMaterial = useMemo(() => createSkyMaterial(), []);

  useEffect(() => {
    const u = sky.current.material.uniforms;
    u.uZenith.value.set(COLORS.skyZenith);
    u.uHorizon.value.set(COLORS.fog);
    u.uGlow.value.set(COLORS.skyGlow);
    u.uGlowDir.value.set(...SKY.glowDirection).normalize();
    u.uGlowStrength.value = SKY.glowStrength;
    u.uGlowPower.value = SKY.glowPower;
    fog.current.color.set(COLORS.fog);
  }, [skyVersion]);

  useFrame(({ camera }) => {
    fog.current.density = KNOBS.fogDensity * heroState.fog;
    // Keep the dome centred on the camera so it behaves like infinity.
    sky.current?.position.copy(camera.position);
  });

  return (
    <>
      <color attach="background" args={[COLORS.fog]} />
      <fogExp2 ref={fog} attach="fog" args={[COLORS.fog, KNOBS.fogDensity]} />
      <mesh ref={sky} material={skyMaterial} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[SKY.radius, 32, 16]} />
      </mesh>

      {/* Rendered once into a small cubemap — used only for reflections/IBL. */}
      <Environment
        key={envVersion}
        frames={1}
        resolution={ENVIRONMENT.resolution}
        environmentIntensity={ENVIRONMENT.intensity}
      >
        <color attach="background" args={[COLORS.skyHorizon]} />
        <Lightformer form="rect" intensity={1.6} color={COLORS.skyZenith} position={[0, 40, 0]} rotation-x={Math.PI / 2} scale={[200, 200, 1]} />
        <Lightformer form="rect" intensity={2.2} color={COLORS.skyGlow} position={[10, 12, -80]} scale={[160, 30, 1]} />
        <Lightformer form="rect" intensity={0.12} color="#101218" position={[0, -20, 0]} rotation-x={-Math.PI / 2} scale={[200, 200, 1]} />
        <Lightformer form="circle" intensity={3} color={COLORS.lensLight} position={getLensWorldPosition()} scale={8} />
      </Environment>
    </>
  );
}
