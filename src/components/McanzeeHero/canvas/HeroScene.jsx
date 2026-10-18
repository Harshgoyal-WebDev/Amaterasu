"use client";

import { Suspense } from "react";
import Atmosphere from "./Atmosphere";
import CameraRig from "./CameraRig";
import EnvironmentModel from "./EnvironmentModel";
import InteractionController from "./InteractionController";
import Lens from "./Lens";
import Lighting from "./Lighting";
import ReadySignal from "./ReadySignal";
import RendererSync from "./RendererSync";
import SceneEnvironment from "./SceneEnvironment";
import Water from "./Water";

/** Composition root — each piece is independent and swappable. */
export default function HeroScene({ quality, parallax, motion, onReady }) {
  return (
    <>
      <RendererSync />
      <CameraRig parallax={parallax} float={motion} />
      <InteractionController enabled={parallax} />
      <SceneEnvironment />
      <Lighting />

      <Water reflections={quality.waterReflections} resolution={quality.reflectionResolution} />

      {/* The GLB streams in; the canvas stays hidden until it has rendered. */}
      <Suspense fallback={null}>
        <EnvironmentModel tier={quality.tier} />
        <Lens tier={quality.tier} />
        <ReadySignal onReady={onReady} />
      </Suspense>

      <Atmosphere tier={quality.tier} />
    </>
  );
}
