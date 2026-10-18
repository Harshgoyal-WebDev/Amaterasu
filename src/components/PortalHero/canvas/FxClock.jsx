"use client";

import { useFrame } from "@react-three/fiber";
import { heroState } from "../state";

/**
 * Single clock for every effect shader. Reduced motion slows everything to a
 * near-still drift instead of freezing it outright.
 */
export default function FxClock({ timeScale = 1 }) {
  useFrame((_, delta) => {
    heroState.time += Math.min(delta, 0.1) * timeScale;
  });
  return null;
}
