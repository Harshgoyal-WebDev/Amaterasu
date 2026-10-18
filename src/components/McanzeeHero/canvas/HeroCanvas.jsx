"use client";

import { useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import {
  LOW_QUALITY_QUERY,
  QUALITY,
  REDUCED_MOTION_QUERY,
  RENDERER,
  getCameraKeyframes,
} from "../config";
import { useConfigVersion } from "../controls/configStore";
import useMediaQuery from "../hooks/useMediaQuery";
import HeroScene from "./HeroScene";

const initialCamera = getCameraKeyframes("desktop").arrival;

/**
 * WebGL layer only — no typography in here. Loaded client-side via
 * next/dynamic, fades in once the first frame is ready, and stops its render
 * loop entirely when `active` is false (hero scrolled past).
 */
export default function HeroCanvas({ active = true, parallax = true }) {
  const lowQuality = useMediaQuery(LOW_QUALITY_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  useConfigVersion("QUALITY"); // re-render on panel edits (dpr, reflections…)
  const quality = lowQuality ? QUALITY.low : QUALITY.high;
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);

  return (
    <Canvas
      className="transition-opacity duration-1000 ease-out"
      style={{ opacity: ready ? 1 : 0 }}
      frameloop={active ? "always" : "never"}
      dpr={quality.dpr}
      gl={{
        antialias: quality.antialias,
        powerPreference: "high-performance",
        stencil: false,
        toneMapping: THREE.NeutralToneMapping,
        toneMappingExposure: RENDERER.exposure,
      }}
      camera={{
        fov: initialCamera.fov,
        near: RENDERER.near,
        far: RENDERER.far,
        position: [initialCamera.x, initialCamera.y, initialCamera.z],
      }}
    >
      <HeroScene
        quality={quality}
        parallax={parallax && !reducedMotion}
        motion={!reducedMotion}
        onReady={onReady}
      />
    </Canvas>
  );
}
