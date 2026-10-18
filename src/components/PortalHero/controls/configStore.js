"use client";

import { useSyncExternalStore } from "react";

/**
 * Change notifications for the live config. Config sections are mutated in
 * place by the Leva panel; `notifyConfig("NETWORK")` bumps that section's
 * version so components that bake values (e.g. rebuild the particle web)
 * can react. Values read every frame need no notification at all.
 */
const versions = new Map();
const listeners = new Set();

export function notifyConfig(section) {
  versions.set(section, (versions.get(section) ?? 0) + 1);
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders when any named section changes; returns a version string. */
export function useConfigVersion(...sections) {
  return useSyncExternalStore(
    subscribe,
    () => sections.map((section) => versions.get(section) ?? 0).join("."),
    () => "0",
  );
}
