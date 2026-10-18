"use client";

import { useEffect } from "react";

/**
 * Mounts only once everything in its Suspense boundary has loaded, then
 * reports ready after the next frame so the canvas fades in fully drawn.
 */
export default function ReadySignal({ onReady }) {
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()));
    return () => cancelAnimationFrame(id);
  }, [onReady]);
  return null;
}
