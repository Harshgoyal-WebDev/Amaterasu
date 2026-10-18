"use client";

import { useEffect } from "react";
import { FINE_POINTER_QUERY, REDUCED_MOTION_QUERY } from "../config";
import { pointerState } from "../heroState";
import useMediaQuery from "./useMediaQuery";

/**
 * Tracks the pointer across the whole window and writes normalised
 * coordinates (-1 → 1, +y = up) into `pointerState`. Used by the camera
 * orbit (smoothed in CameraRig) and the water / rock hover effects.
 *
 * Disabled on touch devices and for users who prefer reduced motion.
 */
export default function usePointerParallax() {
  const hasFinePointer = useMediaQuery(FINE_POINTER_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const enabled = hasFinePointer && !reducedMotion;

  useEffect(() => {
    pointerState.x = 0;
    pointerState.y = 0;
    pointerState.active = false;
    if (!enabled) return;

    const onMove = (e) => {
      pointerState.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerState.y = -((e.clientY / window.innerHeight) * 2 - 1);
      pointerState.active = true;
      pointerState.lastMove = performance.now() / 1000;
    };
    // Ease back to centre when the cursor leaves the window.
    const onLeave = (e) => {
      if (e.relatedTarget) return;
      pointerState.x = 0;
      pointerState.y = 0;
      pointerState.active = false;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [enabled]);

  return enabled;
}
