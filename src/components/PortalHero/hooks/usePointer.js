"use client";

import { useEffect } from "react";
import { FINE_POINTER_QUERY, REDUCED_MOTION_QUERY } from "../config";
import useMediaQuery from "./useMediaQuery";

/**
 * Pointer state shared with the render loop without React re-renders.
 *  - x / y: -1 → 1 across the window (+y up), i.e. normalised device coords.
 *  - active: mouse inside the window, or a finger currently down.
 *  - pressed: a button / finger is down (scratching the boulder).
 *  - downCount: number of presses (click / tap), for water splashes.
 */
export const pointer = { x: 0, y: 0, active: false, downCount: 0, pressed: false };

const toNdc = (e) => [(e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1)];

/**
 * Tracks the pointer for every input type (so touch can drag through the
 * particles and tap the water). Returns whether cursor *parallax* should run:
 * only for a fine pointer without reduced motion.
 */
export default function usePointer() {
  const fine = useMediaQuery(FINE_POINTER_QUERY);
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);

  useEffect(() => {
    const onMove = (e) => {
      [pointer.x, pointer.y] = toNdc(e);
      pointer.active = e.pointerType === "mouse" ? true : e.buttons > 0;
      pointer.pressed = e.buttons > 0;
    };
    const onDown = (e) => {
      [pointer.x, pointer.y] = toNdc(e);
      pointer.downCount += 1;
      pointer.active = true;
      pointer.pressed = true;
    };
    const onUp = (e) => {
      pointer.pressed = false;
      if (e.pointerType !== "mouse") pointer.active = false;
    };
    // Glide back to centre when the cursor leaves the window.
    const onLeave = (e) => {
      if (e.relatedTarget) return;
      pointer.x = 0;
      pointer.y = 0;
      pointer.active = false;
      pointer.pressed = false;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    document.addEventListener("mouseout", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("mouseout", onLeave);
      pointer.x = 0;
      pointer.y = 0;
      pointer.active = false;
    };
  }, []);

  return fine && !reduced;
}
