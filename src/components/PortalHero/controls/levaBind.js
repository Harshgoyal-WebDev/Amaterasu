"use client";

import * as CONFIG from "../config";
import { notifyConfig } from "./configStore";

/**
 * Shared Leva helpers. Every control writes straight into the live config
 * section (read each frame by the canvas). Sections in REBUILD rebuild
 * geometry when edited, debounced so a slider drag doesn't rebuild per tick.
 */
const REBUILD = new Set(["NETWORK", "TUNNEL"]);
const timers = new Map();
function changed(section) {
  if (!REBUILD.has(section)) return notifyConfig(section);
  clearTimeout(timers.get(section));
  timers.set(section, setTimeout(() => notifyConfig(section), 250));
}

/** One control bound to CONFIG[section][key]. */
export function bind(section, key, opts = {}) {
  const target = CONFIG[section];
  return {
    [`${section}__${key}`]: {
      value: Array.isArray(target[key]) ? [...target[key]] : target[key],
      label: opts.label ?? key,
      ...opts,
      onChange: (v, _path, context) => {
        if (context.initial) return;
        target[key] = Array.isArray(v) ? [...v] : v;
        changed(section);
      },
    },
  };
}

export const range = (min, max, step) => ({ min, max, step: step ?? (max - min) / 200 });

/** The named config sections as JS, ready to paste into config.js. */
export function serialize(sections) {
  return sections.map((name) => `export const ${name} = ${JSON.stringify(CONFIG[name], null, 2)};`).join("\n\n");
}
