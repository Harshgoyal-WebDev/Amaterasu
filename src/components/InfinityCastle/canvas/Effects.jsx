"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { BLUR } from "../config";
import { journey } from "../state";
import { EdgeBlurEffect } from "./edgeBlurEffect";

/**
 * Post chain on every tier: edge motion blur (grows with speed, swallows
 * the whole view while falling), bloom on the high tier only so lantern
 * paper and shoji glow bleed into the dark, then tone mapping (the
 * composer disables the renderer's). The blur runs first: it resamples the
 * scene, and bloom is added on top of it.
 */
export default function Effects({ multisampling = 0, bloom = false, reducedMotion = false }) {
  const blur = useMemo(() => new EdgeBlurEffect({ samples: BLUR.samples, stretch: BLUR.stretch }), []);
  const st = useRef({ strength: 0, inner: BLUR.inner });
  useEffect(() => () => blur.dispose(), [blur]);

  useFrame((_, delta) => {
    const s = st.current;
    const fast = THREE.MathUtils.clamp((journey.speed - BLUR.speedFrom) / (BLUR.speedFull - BLUR.speedFrom), 0, 1);
    const fall = journey.falling ? 0.45 + 0.55 * Math.max(journey.fall, fast) : 0;
    const target = Math.min(1.2, Math.max(fast * BLUR.speed, fall * BLUR.fall)) * (reducedMotion ? 0.35 : 1);
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * BLUR.smoothing);
    s.strength += (target - s.strength) * k;
    s.inner += ((journey.falling ? BLUR.innerFall : BLUR.inner) - s.inner) * k;
    blur.uniforms.get("strength").value = s.strength;
    blur.uniforms.get("inner").value = s.inner;
  });

  return (
    <EffectComposer multisampling={multisampling}>
      <primitive object={blur} dispose={null} />
      {bloom && <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.82} luminanceSmoothing={0.2} radius={0.72} levels={5} />}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
