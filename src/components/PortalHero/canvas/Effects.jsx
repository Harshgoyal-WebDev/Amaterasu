"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { DISTORTION, POST, VOID, WARP } from "../config";
import { useConfigVersion } from "../controls/configStore";
import { heroState } from "../state";
import { FluidGlassEffect } from "./fluid/FluidGlassEffect";
import { fluidOutput } from "./fluid/fluidOutput";

/**
 * Post chain:
 *   1. liquid glass — the cursor's fluid refracts the scene with chromatic
 *      dispersion and reflections (transparent where there's no fluid);
 *      also the portal-crossing distortion
 *   2. HDR bloom on the brightest filaments / gate ring (and glass highlights)
 *   3. tone mapping — EffectComposer disables the renderer's own, so it
 *      lives here; exposure still comes from renderer.toneMappingExposure.
 */
export default function Effects({ multisampling = 4, levels = 7, warpScale = 1 }) {
  const bloom = useRef(null);
  const glass = useMemo(() => new FluidGlassEffect(), []);
  useEffect(() => () => glass.dispose(), [glass]);
  useConfigVersion("POST"); // re-render when the tone-mapping mode changes
  const mode = ToneMappingMode[POST.toneMapping] ?? ToneMappingMode.AGX;

  useFrame(({ gl }) => {
    gl.toneMappingExposure = POST.exposure;
    glass.sync(fluidOutput, DISTORTION);
    // in the void: edge RGB split always, + edge motion blur with fall speed
    const j = heroState.journey;
    const inVoid = j.void * j.motionFx * warpScale;
    glass.syncWarp(j.warp * warpScale, j.speed * inVoid, VOID.chromatic * inVoid, VOID.edgeBlur * j.void, WARP, VOID);
    const b = bloom.current;
    if (!b) return;
    b.intensity = POST.bloomIntensity * heroState.fx.glowIntensity;
    b.luminanceMaterial.threshold = POST.bloomThreshold;
    b.luminanceMaterial.smoothing = POST.bloomSmoothing;
    if (b.mipmapBlurPass) b.mipmapBlurPass.radius = POST.bloomRadius;
  });

  return (
    <EffectComposer multisampling={multisampling}>
      <primitive object={glass} />
      <Bloom
        ref={bloom}
        mipmapBlur
        intensity={POST.bloomIntensity}
        luminanceThreshold={POST.bloomThreshold}
        luminanceSmoothing={POST.bloomSmoothing}
        radius={POST.bloomRadius}
        levels={levels}
      />
      <ToneMapping key={mode} mode={mode} />
    </EffectComposer>
  );
}
