"use client";

import { useSyncExternalStore } from "react";

/**
 * Change notifications for the live config. Config objects are mutated in
 * place (by the Leva panel); `notifyConfig("LENS")` then bumps that
 * section's version so consumers that cached or baked a value can resync.
 *
 * Nothing calls notifyConfig unless the controls panel is open, so in normal
 * use this costs nothing.
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

/**
 * Re-renders when any of the named config sections change. Returns a string
 * that changes with them — use it as an effect / memo dependency.
 */
export function useConfigVersion(...sections) {
  return useSyncExternalStore(
    subscribe,
    () => sections.map((section) => versions.get(section) ?? 0).join("."),
    () => "0",
  );
}
