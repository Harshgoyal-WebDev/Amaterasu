"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * The Leva panel is on in development and off in production; `?controls`
 * forces it on (e.g. on a preview deploy), `?controls=0` forces it off.
 */
export default function useControlsEnabled() {
  return useSyncExternalStore(
    subscribe,
    () => {
      const param = new URLSearchParams(window.location.search).get("controls");
      if (param !== null) return param !== "0";
      return process.env.NODE_ENV !== "production";
    },
    () => false,
  );
}
