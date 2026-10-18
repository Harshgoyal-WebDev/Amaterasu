"use client";

import { useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { CAMERA, LOW_QUALITY_QUERY, QUALITY, REDUCED_MOTION_QUERY } from "../config";
import useMediaQuery from "../hooks/useMediaQuery";
import PortalScene from "./PortalScene";

const MIN_DPR = 0.75;
const round = (v) => Math.round(v * 100) / 100;

/**
 * The one WebGL canvas. Loaded client-side via next/dynamic and faded in once
 * the model is on screen. Phones / touch devices get the "low" tier.
 *
 * Adaptive resolution: PerformanceMonitor watches the frame rate and steps the
 * pixel ratio down (to 0.75 at worst) when frames drop, and back up when
 * there's headroom — the scene is fill-rate bound, so this is the most
 * effective single lever. Anti-aliasing comes from the composer's MSAA.
 */
export default function PortalCanvas({ parallax = true }) {
  const lowQuality = useMediaQuery(LOW_QUALITY_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const quality = lowQuality ? QUALITY.low : QUALITY.high;
  const maxDpr = quality.dpr[1];
  const [dpr, setDpr] = useState(maxDpr);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const onDecline = useCallback(() => setDpr((d) => round(Math.max(MIN_DPR, d - 0.25))), []);
  const onIncline = useCallback(() => setDpr((d) => round(Math.min(maxDpr, d + 0.25))), [maxDpr]);
  const onFallback = useCallback(() => setDpr(1), []);

  // [min, max]: never above the device's own pixel ratio, never below `dpr`
  // once the monitor has stepped down.
  const dprRange = [Math.min(1, dpr), Math.min(dpr, maxDpr)];

  return (
    <Canvas
      className="transition-opacity duration-1000 ease-out"
      style={{ opacity: ready ? 1 : 0 }}
      dpr={dprRange}
      shadows={quality.shadows}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far, position: CAMERA.position }}
    >
      <PerformanceMonitor
        bounds={(refresh) => (refresh > 90 ? [55, 100] : [45, 58])}
        flipflops={6}
        onDecline={onDecline}
        onIncline={onIncline}
        onFallback={onFallback}
      />
      <PortalScene quality={quality} parallax={parallax} reducedMotion={reducedMotion} onReady={onReady} journey={ready} />
    </Canvas>
  );
}
