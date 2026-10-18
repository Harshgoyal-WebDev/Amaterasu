"use client";

import { useState } from "react";
import { Leva, button, folder, useControls } from "leva";
import * as CONFIG from "../config";
import { notifyConfig } from "./configStore";

/**
 * Leva panel for every value in config.js, generated from the config objects
 * themselves (so new config entries show up automatically). Edits write
 * straight into the live config and notify that section.
 *
 * "Copy config" puts the current values on the clipboard as JS, ready to
 * paste back into config.js — the panel itself does not persist anything.
 */

// Panel order + folder titles. Anything exported from config.js as a plain
// object and not listed here is appended at the end.
const SECTIONS = [
  ["KNOBS", "Quick knobs"],
  ["RUNES", "Runes"],
  ["LENS", "Lens"],
  ["ENV_MODEL", "Environment model"],
  ["ENV_MATERIAL", "Stone material"],
  ["CAMERA_KEYFRAMES", "Camera keyframes"],
  ["CAMERA", "Camera"],
  ["PARALLAX", "Parallax"],
  ["SCROLL", "Scroll"],
  ["STAGE_VALUES", "Stage values"],
  ["COLORS", "Colours"],
  ["LIGHTS", "Lights"],
  ["SKY", "Sky"],
  ["ENVIRONMENT", "Reflections (env map)"],
  ["WATER", "Water"],
  ["INTERACTION", "Interaction"],
  ["SOUNDWAVE", "Soundwave"],
  ["AUDIO", "Music"],
  ["ATMOSPHERE", "Mist"],
  ["RENDERER", "Renderer"],
  ["QUALITY", "Quality tiers"],
];

// Keys that are identifiers, not tunables (or need a full reload to apply).
const SKIP = new Set(["url", "tier", "antialias", "axis"]);

// Slider ranges by "SECTION.key" or key name; anything else gets a range
// around its default.
const RANGES = {
  "LENS.scale": [0.1, 1],
  rotationY: [-Math.PI, Math.PI],
  fov: [10, 90],
  maxFov: [20, 100],
  ior: [1, 2.5],
  fill: [0.5, 1.2],
  bulge: [0.05, 0.8],
  edge: [0, 0.2],
  opacity: [0, 1],
  reflectivity: [0, 1],
  baseReflection: [0, 1],
  idleEnergy: [0, 1],
  approachShare: [0.05, 0.95],
  whiteoutStart: [0, 1],
  gaps: [0, 0.9],
  wetDarken: [0, 1],
  wetRoughness: [0, 1],
  roughness: [0, 1],
  clearcoat: [0, 1],
  clearcoatRoughness: [0, 1],
  iridescence: [0, 1],
  volume: [0, 1],
  space: [0, 1],
  brightness: [0, 1],
  shimmer: [0, 1],
  "AUDIO.shimmer": [0, 1.5],
  chordSeconds: [3, 30],
  arrival: [0, 1],
  approach: [0, 1],
  transition: [0, 1],
};
const INTEGERS = {
  segments: [16, 256, 8],
  maxRipples: [1, 16, 1],
  rings: [1, 6, 1],
  samples: [1, 16, 1],
  resolution: [32, 512, 32],
  sectionHeightVh: [150, 1000, 10],
};

const pathKey = (path) => path.join("/");

function numberOptions(key, value, section) {
  if (INTEGERS[key]) {
    const [min, max, step] = INTEGERS[key];
    return { min, max, step };
  }
  const range = RANGES[`${section}.${key}`] ?? RANGES[key];
  if (range) return { min: range[0], max: range[1], step: (range[1] - range[0]) / 200 };
  const mag = Math.abs(value) || 1;
  const step = Number((mag / 100).toPrecision(1));
  return value >= 0 ? { min: 0, max: Number((mag * 5).toPrecision(3)), step } : { min: -mag * 5, max: mag * 5, step };
}

function setIn(root, path, value) {
  let target = root;
  for (let i = 0; i < path.length - 1; i++) target = target[path[i]];
  // Arrays are replaced, not edited in place, so React props that receive
  // them (light positions, dpr…) see a new identity and update.
  target[path[path.length - 1]] = Array.isArray(value) ? [...value] : value;
}

function buildSchema(section, root, object, path) {
  const schema = {};
  Object.entries(object).forEach(([key, value]) => {
    if (SKIP.has(key) || typeof value === "function") return;
    const fullPath = [...path, key];
    const id = `${section}/${pathKey(fullPath)}`;
    const onChange = (v, _path, context) => {
      if (context.initial) return;
      setIn(root, fullPath, v);
      notifyConfig(section);
    };

    if (typeof value === "number") {
      schema[id] = { value, label: key, ...numberOptions(key, value, section), onChange };
    } else if (typeof value === "boolean") {
      schema[id] = { value, label: key, onChange };
    } else if (typeof value === "string") {
      if (value.startsWith("#")) schema[id] = { value, label: key, onChange };
    } else if (Array.isArray(value) && value.every((v) => typeof v === "number")) {
      const mag = Math.max(...value.map(Math.abs), 0.01);
      schema[id] = { value: [...value], label: key, step: Number((mag / 100).toPrecision(1)), joystick: false, onChange };
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        schema[`${key} ${i + 1}`] = folder(buildSchema(section, root, item, [...fullPath, i]), { collapsed: true });
      });
    } else if (value && typeof value === "object") {
      schema[key] = folder(buildSchema(section, root, value, fullPath), { collapsed: true });
    }
  });
  return schema;
}

function serialize() {
  return SECTIONS.map(([name]) => `export const ${name} = ${JSON.stringify(CONFIG[name], null, 2)};`).join("\n\n");
}

function createSchema() {
  const known = new Set(SECTIONS.map(([name]) => name));
  const extra = Object.keys(CONFIG)
    .filter((name) => !known.has(name) && CONFIG[name] && typeof CONFIG[name] === "object" && !Array.isArray(CONFIG[name]))
    .map((name) => [name, name]);

  const schema = {
    "Copy config": button(() => navigator.clipboard?.writeText(serialize())),
  };
  [...SECTIONS, ...extra].forEach(([name, title], i) => {
    schema[title] = folder(buildSchema(name, CONFIG[name], CONFIG[name], []), { collapsed: i > 1 });
  });
  return schema;
}

export default function HeroControls() {
  // Built once: the schema snapshots the config at mount, then the panel
  // owns the values.
  const [schema] = useState(createSchema);
  useControls(schema);

  return (
    <Leva
      collapsed={false}
      titleBar={{ title: "MCanzee hero" }}
      theme={{ sizes: { rootWidth: "360px", controlWidth: "170px" } }}
    />
  );
}
