"use client";

import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { INTERACTION, SOUNDWAVE, getAperture } from "../config";
import { useConfigVersion } from "../controls/configStore";
import { FX_UNIFORMS as FX } from "../fx";
import { pointerState, soundBus } from "../heroState";

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const state = {
  energy: 0,
  waterStrength: 0,
  lastSpawn: new THREE.Vector3(Infinity, 0, 0),
  lastSpawnTime: -Infinity,
  rippleIndex: 0,
};


/**
 * Per-frame driver for every interactive effect. No React state, no scene
 * raycasts against meshes — just one ray:
 *
 *  - pointer ray → stone shader (runes reveal inside a cone around it);
 *  - ray ∩ water plane → glow spot + ripples spawned into a ring buffer;
 *  - soundwave pulse age: music downbeats while playing, else a fixed clock.
 */
export default function InteractionController({ enabled = true }) {
  const placementVersion = useConfigVersion("ENV_MODEL");
  useEffect(() => {
    const { center } = getAperture();
    FX.uPulseOrigin.value.set(center[0], center[2]);
  }, [placementVersion]);

  useFrame(({ camera, clock }, delta) => {
    const t = clock.elapsedTime;
    const dt = Math.min(delta, 0.1);
    FX.uFxTime.value = t;

    // ── Soundwave clock: music downbeats when playing, else a fixed period ─
    const now = performance.now() / 1000;
    FX.uPulseAge.value = soundBus.playing ? Math.max(now - soundBus.pulseAt, 0) : t % SOUNDWAVE.period;
    FX.uPulseSpeed.value = SOUNDWAVE.speed;

    // ── Pointer ────────────────────────────────────────────────────────
    const { runeHover, water } = INTERACTION;
    FX.uHoverAngle.value = runeHover.angle;
    const active = enabled && pointerState.active;
    const moving = active && now - pointerState.lastMove < 0.25;
    const energyTarget = moving ? 1 : active ? runeHover.idleEnergy : 0;
    const rate = energyTarget > state.energy ? runeHover.rise : runeHover.fall;
    state.energy += (energyTarget - state.energy) * (1 - Math.exp(-rate * dt));
    FX.uHoverEnergy.value = state.energy;

    let onWater = false;
    if (active) {
      ndc.set(pointerState.x, pointerState.y);
      raycaster.setFromCamera(ndc, camera);
      FX.uRayOrigin.value.copy(raycaster.ray.origin);
      FX.uRayDir.value.copy(raycaster.ray.direction);

      onWater =
        raycaster.ray.intersectPlane(waterPlane, hit) !== null &&
        hit.distanceTo(camera.position) < water.maxDistance;
    }

    state.waterStrength += ((onWater ? 1 : 0) - state.waterStrength) * (1 - Math.exp(-4 * dt));
    if (onWater) FX.uWaterPointer.value.set(hit.x, hit.z, state.waterStrength);
    else FX.uWaterPointer.value.z = state.waterStrength;

    // Spawn ripples: when the pointer has travelled far enough on the water,
    // or gently at an interval while it rests.
    if (onWater) {
      const travelled = Math.hypot(hit.x - state.lastSpawn.x, hit.z - state.lastSpawn.z);
      const idleDue = t - state.lastSpawnTime > water.idleInterval;
      if (travelled > water.spawnSpacing || idleDue) {
        const ripples = FX.uRipples.value;
        state.rippleIndex %= ripples.length;
        ripples[state.rippleIndex].set(hit.x, hit.z, t);
        state.rippleIndex = (state.rippleIndex + 1) % ripples.length;
        state.lastSpawn.set(hit.x, 0, hit.z);
        state.lastSpawnTime = t;
      }
    }
  });

  return null;
}
