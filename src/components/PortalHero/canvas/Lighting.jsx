"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { JOURNEY, LIGHT_RIG, LIGHTS, VOID } from "../config";
import { heroState } from "../state";
import { setLightOn, syncShadows } from "./shadows";

const RENDERER_SHADOW_SIZE = 2048;
const HEMI_SKY = "#9a96c8";
const HEMI_GROUND = "#0b0a0d";
const voidSky = new THREE.Color();
const voidGround = new THREE.Color();

/** Spot light aimed at a fixed world point; intensity read live from LIGHTS. */
function Spot({ spot, castShadow }) {
  const light = useRef(null);
  const aim = useRef(null);
  useEffect(() => {
    light.current.target = aim.current;
  }, []);
  useFrame(() => {
    const intensity = LIGHTS[spot.key];
    setLightOn(light.current, intensity > 0);
    light.current.intensity = intensity * heroState.fx.ambient;
    light.current.color.set(LIGHTS.coolColor);
  });
  return (
    <>
      <spotLight
        ref={light}
        position={spot.position}
        angle={spot.angle}
        penumbra={spot.penumbra}
        decay={2}
        castShadow={castShadow}
        shadow-mapSize={[RENDERER_SHADOW_SIZE / 2, RENDERER_SHADOW_SIZE / 2]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <object3D ref={aim} position={spot.target} />
    </>
  );
}

/**
 * The original cool architectural rig, kept dim (night). Every intensity is
 * read from LIGHTS each frame, so the Leva panel edits it live. Lights at 0
 * are switched off entirely (no per-pixel cost), and shadow maps are static
 * (see shadows.js).
 */
export default function Lighting({ shadows = true }) {
  const hemi = useRef(null);
  const moon = useRef(null);
  const moonAim = useRef(null);

  useEffect(() => {
    moon.current.target = moonAim.current;
  }, []);

  useFrame(({ gl }) => {
    syncShadows(gl);
    setLightOn(hemi.current, LIGHTS.hemisphere > 0);
    setLightOn(moon.current, LIGHTS.moon > 0);
    // in the void the dim cool fill becomes a soft violet one
    const v = heroState.journey.void;
    const fill = JOURNEY.voidFill;
    hemi.current.intensity = LIGHTS.hemisphere * heroState.fx.ambient * (1 - v) + VOID.fill * v;
    hemi.current.color.set(HEMI_SKY).lerp(voidSky.set(fill.sky), v);
    hemi.current.groundColor.set(HEMI_GROUND).lerp(voidGround.set(fill.ground), v);
    moon.current.intensity = LIGHTS.moon * heroState.fx.ambient;
    moon.current.color.set(LIGHTS.coolColor);
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={[HEMI_SKY, HEMI_GROUND]} />
      <directionalLight
        ref={moon}
        position={LIGHT_RIG.moon.position}
        castShadow={shadows}
        shadow-mapSize={[RENDERER_SHADOW_SIZE, RENDERER_SHADOW_SIZE]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.04}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
      <object3D ref={moonAim} position={LIGHT_RIG.moon.target} />

      {LIGHT_RIG.spots.map((spot) => (
        <Spot key={spot.name} spot={spot} castShadow={shadows && !!spot.castShadow} />
      ))}
    </>
  );
}
