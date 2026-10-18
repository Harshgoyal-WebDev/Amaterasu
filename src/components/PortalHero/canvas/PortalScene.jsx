"use client";

import { Suspense } from "react";
import { WATER } from "../config";
import { useConfigVersion } from "../controls/configStore";
import Atmosphere from "./Atmosphere";
import CameraRig from "./CameraRig";
import Effects from "./Effects";
import FxClock from "./FxClock";
import JourneyWarmup from "./journey/JourneyWarmup";
import SkillsBoulder from "./journey/SkillsBoulder";
import Tunnel from "./journey/Tunnel";
import Lighting from "./Lighting";
import PortalLighting from "./PortalLighting";
import PortalModel from "./PortalModel";
import PortalParticleNetwork from "./network/PortalParticleNetwork";
import PortalWater from "./water/PortalWater";

/**
 * Scene composition (inside the single Canvas):
 *
 *   FxClock               shared effect time (slowed for reduced motion)
 *   CameraRig             heroState.camera + cursor parallax
 *   Atmosphere            background, fog (thickens in the void), floor mist
 *   Lighting              original cool rig (dim; dimmer past the portal)
 *   PortalModel           the Blender corridor + portal
 *   PortalLighting        3 violet lights (two re-used in the void) + the gate glow
 *   PortalParticleNetwork fluid sim → GPU particles, gooey threads
 *   PortalWater           heightmap water, ripples, energy reflection
 *   — journey (loaded once the hero is on screen) —
 *   Tunnel                instanced rocks + dust along the fall
 *   SkillsBoulder         the monolith with its dusty, scratchable skills
 *   JourneyWarmup         pre-uploads / pre-compiles all of the above
 *   Effects               liquid glass + portal-crossing warp + bloom + tone mapping
 *
 * Each world hides itself (and stops its per-frame work) when the camera is
 * elsewhere in the journey — nothing mounts or unmounts while scrolling.
 */
export default function PortalScene({ quality, parallax, reducedMotion, onReady, journey }) {
  useConfigVersion("WATER"); // water on/off toggle
  return (
    <>
      <FxClock timeScale={reducedMotion ? 0.15 : 1} />
      <CameraRig parallax={parallax} />
      <Atmosphere />
      <Suspense fallback={null}>
        <Lighting shadows={quality.shadows} />
        <PortalModel shadows={quality.shadows} onReady={onReady} />
        <PortalLighting />
        <PortalParticleNetwork quality={quality} />
        {WATER.enabled && (
          <PortalWater reflectionScale={quality.reflectionScale} ambientDrips={!reducedMotion} />
        )}
      </Suspense>
      {journey && (
        <Suspense fallback={null}>
          <Tunnel density={quality.density} />
          <SkillsBoulder />
          <JourneyWarmup />
        </Suspense>
      )}
      <Effects multisampling={quality.multisampling} levels={quality.bloomLevels} warpScale={quality.warp} />
    </>
  );
}
