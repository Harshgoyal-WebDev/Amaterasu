import * as THREE from "three";
import { INTERACTION, SOUNDWAVE } from "./config";

/**
 * Uniforms shared by reference between the stone (rune) material and the
 * water shader. InteractionController writes them once per frame, every
 * material that holds a reference sees the new values for free.
 */
export const FX_UNIFORMS = {
  uFxTime: { value: 0 },

  // Pointer ray (world space) — runes reveal inside a cone around it.
  uRayOrigin: { value: new THREE.Vector3() },
  uRayDir: { value: new THREE.Vector3(0, 0, -1) },
  uHoverEnergy: { value: 0 },
  uHoverAngle: { value: INTERACTION.runeHover.angle },

  // Pointer on water: glow spot + ring buffer of ripples (x, z, startTime).
  uWaterPointer: { value: new THREE.Vector3(0, 0, 0) }, // x, z, strength
  uRipples: {
    value: Array.from({ length: INTERACTION.water.maxRipples }, () => new THREE.Vector3(0, 0, -1000)),
  },

  // "Soundwave" pulse emitted from the portal base.
  uPulseOrigin: { value: new THREE.Vector2() },
  uPulseAge: { value: 1000 },
  uPulseSpeed: { value: SOUNDWAVE.speed },
};

/** Matches the ripple ring buffer to INTERACTION.water.maxRipples. */
export function resizeRipples(count) {
  const ripples = FX_UNIFORMS.uRipples.value;
  while (ripples.length < count) ripples.push(new THREE.Vector3(0, 0, -1000));
  ripples.length = count;
}
