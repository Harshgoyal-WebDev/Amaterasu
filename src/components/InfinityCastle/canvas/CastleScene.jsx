"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster } from "three";
import { useGLTF } from "@react-three/drei";
import { ASSET_BASE } from "../config";
import { ASSET_URLS } from "../assets/manifest";
import { buildRegistry } from "../assets/registry";
import { journey, resetJourney, uiStore } from "../state";
import { CastleWorld } from "../world/CastleWorld";
import Atmosphere from "./Atmosphere";
import BackgroundArchitecture from "./BackgroundArchitecture";
import CameraRig from "./CameraRig";
import Crows from "./Crows";
import Effects from "./Effects";
import LanternLights from "./LanternLights";
import WorldController from "./WorldController";

const URLS = ASSET_URLS(ASSET_BASE);
URLS.forEach((u) => useGLTF.preload(u, false, true));

/**
 * Loads every GLB once (meshopt, cached by drei), turns them into the shared
 * prefab registry, starts the infinite world and wires the per-frame systems.
 * The first frames are pre-compiled before the overlay says "ready".
 */
export default function CastleScene({ quality, lights, input, reducedMotion, onReady }) {
  const gltfs = useGLTF(URLS, false, true);
  const registry = useMemo(() => buildRegistry(gltfs), [gltfs]);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  // the world object is cheap to construct; chunks are only built in start()
  const world = useMemo(() => new CastleWorld({ registry, quality, reducedMotion }), [registry]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    registry.materials.setAnisotropy(Math.min(quality.anisotropy, gl.capabilities.getMaxAnisotropy()));
  }, [registry, quality.anisotropy, gl]);

  useEffect(() => {
    registry.retain();
    return () => registry.release();
  }, [registry]);

  useEffect(() => world.setQuality(quality, reducedMotion), [world, quality, reducedMotion]);

  // start the journey, pre-compile every program the opening needs, then reveal
  useEffect(() => {
    let cancelled = false;
    resetJourney();
    const { width, height } = gl.domElement.getBoundingClientRect();
    world.start(width / Math.max(1, height));
    syncCamera(camera);
    // dev-only handle for automated journey tests
    if (process.env.NODE_ENV !== "production") window.__castle = { world, journey, ui: uiStore, renderer: gl, camera, Raycaster };
    const compile = gl.compileAsync ? gl.compileAsync(scene, camera) : Promise.resolve(gl.compile(scene, camera));
    compile
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        uiStore.set({ phase: "ready" });
        input.enable(true);
        onReady?.();
      });
    return () => {
      cancelled = true;
      input.enable(false);
      world.stop();
    };
  }, [world, gl, scene, camera, input, onReady]);

  return (
    <>
      <primitive object={world.root} />
      <WorldController world={world} input={input} />
      <CameraRig reducedMotion={reducedMotion} />
      <LanternLights world={world} count={lights} />
      <Atmosphere quality={quality} />
      <BackgroundArchitecture registry={registry} quality={quality} />
      <Crows world={world} />
      <Effects multisampling={quality.msaa} bloom={quality.bloom} reducedMotion={reducedMotion} />
    </>
  );
}

function syncCamera(camera) {
  camera.position.copy(journey.pose.p);
  camera.quaternion.copy(journey.pose.q);
  camera.updateMatrixWorld();
}
