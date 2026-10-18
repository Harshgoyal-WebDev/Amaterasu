import { STAGE_VALUES, getCameraKeyframes } from "./config";

/**
 * Plain mutable objects shared between the DOM side (GSAP / pointer / audio)
 * and the R3F side (useFrame readers). Nothing here triggers React renders.
 */

// Driven by the scroll timeline.
export const heroState = {
  camera: { ...getCameraKeyframes("desktop").arrival },
  ...STAGE_VALUES.arrival,
  progress: 0,
};

// Raw normalised pointer (-1 → 1). Written by usePointerParallax.
export const pointerState = {
  x: 0,
  y: 0,
  active: false, // pointer is over the page and interaction is enabled
  lastMove: -Infinity, // performance.now() / 1000 of the last move
};

// Audio → canvas bridge: while music plays, it drives the soundwave pulses
// (performance.now() / 1000 of the latest downbeat) instead of the idle clock.
export const soundBus = {
  playing: false,
  pulseAt: -Infinity,
};

export function resetHeroState(cameraArrival) {
  Object.assign(heroState.camera, cameraArrival);
  Object.assign(heroState, STAGE_VALUES.arrival);
  heroState.progress = 0;
}
