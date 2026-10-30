"use client";

import { useFrame } from "@react-three/fiber";
import { materialUniforms } from "../assets/materials";

/**
 * Frame driver for the infinite world: input intent → navigation → pose.
 * Runs before the camera rig (priority -2 vs -1). No React state here.
 */
export default function WorldController({ world, input }) {
  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20);
    materialUniforms.uIcTime.value = state.clock.elapsedTime;
    world.update(dt, input.read(dt), state.camera);
  }, -2);
  return null;
}
