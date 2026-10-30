"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { CAMERA, LOW_QUALITY_QUERY, PALETTE, QUALITY, RENDERER } from "../config";
import { uiStore } from "../state";
import CastleScene from "./CastleScene";

const MIN_DPR = 0.8;
const TIERS = ["high", "medium", "low"];
const round = (v) => Math.round(v * 100) / 100;

/**
 * The one persistent WebGL canvas. Client-only (next/dynamic, ssr: false).
 *
 * Adaptive quality: PerformanceMonitor steps the pixel ratio down when the
 * frame rate drops; once it bottoms out, the quality tier drops a level
 * (fewer particles, no bloom, less dressing). It never steps back up a tier
 * mid-journey. The pooled light count is fixed by the starting tier: changing
 * it would recompile every material at once (a half-second freeze).
 */
export default function ExperienceCanvas({ input, initialTier = "high", reducedMotion = false, onReady }) {
  // client-only component: read the device class directly on mount
  const [tier, setTier] = useState(() => (window.matchMedia(LOW_QUALITY_QUERY).matches ? "low" : initialTier));
  const quality = QUALITY[tier];
  const [lights] = useState(() => QUALITY[tier].lights);
  useEffect(() => uiStore.set({ quality: tier }), [tier]);
  const [dpr, setDpr] = useState(quality.dpr[1]);
  const declines = useRef(0);

  // frames dropping: lower the pixel ratio; once it bottoms out twice, drop a tier
  const onDecline = useCallback(() => {
    if (dpr > MIN_DPR + 0.01) {
      setDpr(round(Math.max(MIN_DPR, dpr - 0.2)));
      return;
    }
    declines.current += 1;
    if (declines.current < 2 || tier === "low") return;
    declines.current = 0;
    const next = TIERS[TIERS.indexOf(tier) + 1];
    setTier(next);
    setDpr(QUALITY[next].dpr[1]);
    uiStore.set({ quality: next });
  }, [dpr, tier]);
  const onIncline = useCallback(() => setDpr((d) => round(Math.min(QUALITY[tier].dpr[1], d + 0.2))), [tier]);

  const dprRange = [Math.min(quality.dpr[0], dpr), Math.min(dpr, quality.dpr[1])];

  return (
    <Canvas
      dpr={dprRange}
      flat={false}
      gl={{
        antialias: false, // the post chain renders off-screen (multisampled per tier)
        powerPreference: "high-performance",
        stencil: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: RENDERER.exposure,
      }}
      camera={{ fov: CAMERA.fov, near: RENDERER.near, far: RENDERER.far, position: [0, CAMERA.eye, 14] }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(PALETTE.void, 1);
        scene.background = new THREE.Color(PALETTE.void);
      }}
      style={{ position: "absolute", inset: 0 }}
    >
      <PerformanceMonitor bounds={(refresh) => (refresh > 90 ? [58, 100] : [44, 58])} flipflops={4} onDecline={onDecline} onIncline={onIncline} />
      <Suspense fallback={null}>
        <CastleScene quality={quality} lights={lights} input={input} reducedMotion={reducedMotion} onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
