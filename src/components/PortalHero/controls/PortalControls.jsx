"use client";

import { useState } from "react";
import { Leva, button, folder, useControls } from "leva";
import * as CONFIG from "../config";
import { heroState } from "../state";
import { bind, range, serialize } from "./levaBind";

/**
 * Leva panel for the portal hero (the tunnel has its own: TunnelControls).
 * "Copy config" puts the current values on the clipboard as JS, ready to
 * paste into config.js — the panel itself doesn't persist anything.
 */

function fxControl(key) {
  return {
    [`fx__${key}`]: {
      value: heroState.fx[key],
      label: key,
      ...range(0, 3),
      onChange: (v) => {
        heroState.fx[key] = v;
      },
    },
  };
}

function createSchema() {
  return {
    "Copy config": button(() => navigator.clipboard?.writeText(serialize(CONFIG.LIVE_SECTIONS))),

    "Particles · fluid motion": folder({
      ...bind("PARTICLES", "fluidForce", range(0, 12)),
      ...bind("PARTICLES", "drag", range(0.2, 10)),
      ...bind("PARTICLES", "nodeSpring", range(0, 15)),
      ...bind("PARTICLES", "dustSpring", range(0, 4)),
      ...bind("PARTICLES", "maxOffset", range(0, 8)),
      ...bind("PARTICLES", "wander", range(0, 2)),
      ...bind("PARTICLES", "stirGlow", range(0, 5)),
      ...bind("PARTICLES", "smokeTint", { ...range(0, 2), label: "trail glow" }),
    }),

    "Fluid · cursor": folder({
      ...bind("FLUID", "splatForce", range(0, 20000, 100)),
      ...bind("FLUID", "splatRadius", range(0.02, 1)),
      ...bind("FLUID", "trail", { ...range(0, 2), label: "trail amount" }),
      ...bind("FLUID", "dyeDissipation", { ...range(0, 4), label: "trail fade" }),
    }),

    "Fluid · glass cursor": folder({
      ...bind("DISTORTION", "enabled"),
      ...bind("DISTORTION", "refraction", range(0, 1.5)),
      ...bind("DISTORTION", "chromatic", { ...range(0, 2), label: "chromatic aberration" }),
      ...bind("DISTORTION", "normalScale", range(0, 20)),
      ...bind("DISTORTION", "reflection", range(0, 3)),
      ...bind("DISTORTION", "mirror", range(0, 1.5)),
      ...bind("DISTORTION", "rim", range(0, 1.5)),
      ...bind("DISTORTION", "highlightColor"),
      ...bind("DISTORTION", "rimColor"),
    }),

    "Particles · look": folder(
      {
        ...bind("PARTICLES", "nodeBrightness", range(0, 15)),
        ...bind("PARTICLES", "threadBrightness", range(0, 15)),
        ...bind("PARTICLES", "dustBrightness", range(0, 5)),
        ...bind("PARTICLES", "nodeSize", range(0, 3)),
        ...bind("PARTICLES", "dustSize", range(0, 3)),
        ...bind("PARTICLES", "threadWidth", range(0, 0.06, 0.001)),
        ...bind("PARTICLES", "threadBend", range(0, 0.5)),
        ...bind("PARTICLES", "threadCurve", range(0, 0.6)),
        ...bind("PARTICLES", "twinkle", range(0, 1)),
        ...bind("PARTICLES", "pulses", range(0, 2)),
        ...bind("PARTICLES", "colorDeep"),
        ...bind("PARTICLES", "colorMid"),
        ...bind("PARTICLES", "colorBright"),
        ...bind("PARTICLES", "colorHot"),
      },
      { collapsed: true },
    ),

    "Web structure (rebuilds)": folder(
      {
        ...bind("NETWORK", "seed", range(1, 9999, 1)),
        ...bind("NETWORK", "archNodes", range(0, 5000, 50)),
        ...bind("NETWORK", "tendrils", range(0, 60, 1)),
        ...bind("NETWORK", "strands", range(0, 30, 1)),
        ...bind("NETWORK", "dustCount", range(0, 20000, 100)),
        ...bind("NETWORK", "connectDistance", range(0.1, 0.8)),
        ...bind("NETWORK", "maxDegree", range(1, 8, 1)),
        ...bind("NETWORK", "dropLinks", range(0, 0.9)),
        ...bind("NETWORK", "highlightRatio", range(0, 0.3)),
        ...bind("NETWORK", "anchorReach", range(0, 1.5)),
      },
      { collapsed: true },
    ),

    "Portal gate": folder({
      ...bind("GATE", "ringIntensity", range(0, 20)),
      ...bind("GATE", "ringWidth", range(0.01, 0.5)),
      ...bind("GATE", "coreColor"),
      ...bind("GATE", "ringColor"),
      ...bind("GATE", "hotIntensity", range(0, 15)),
      ...bind("GATE", "hotPosition", range(0, 1)),
      ...bind("GATE", "hotSpread", range(0.01, 0.6)),
      ...bind("GATE", "hotDrift", range(-0.2, 0.2)),
      ...bind("GATE", "surfaceIntensity", range(0, 20)),
      ...bind("GATE", "surfaceFalloff", range(0.02, 1.5)),
    }),

    "Violet lights": folder(
      {
        ...bind("VIOLET", "coreColor"),
        ...bind("VIOLET", "coreIntensity", range(0, 400)),
        ...bind("VIOLET", "coreDistance", range(1, 60)),
        ...bind("VIOLET", "spillColor"),
        ...bind("VIOLET", "spillIntensity", range(0, 200)),
        ...bind("VIOLET", "spillDistance", range(1, 40)),
        ...bind("VIOLET", "washColor"),
        ...bind("VIOLET", "washIntensity", range(0, 600)),
      },
      { collapsed: true },
    ),

    "Scene lights": folder(
      {
        ...bind("LIGHTS", "coolColor"),
        ...bind("LIGHTS", "hemisphere", range(0, 0.5)),
        ...bind("LIGHTS", "moon", range(0, 5)),
        ...bind("LIGHTS", "rakeR", range(0, 4000)),
      },
      { collapsed: true },
    ),

    Stone: folder(
      {
        ...bind("STONE", "roughnessVariation", range(0, 1)),
        ...bind("STONE", "bump", range(0, 0.05, 0.001)),
        ...bind("STONE", "crevice", range(0, 1)),
        ...bind("STONE", "grime", range(0, 1)),
        ...bind("STONE", "damp", range(0, 1)),
        ...bind("STONE", "dampHeight", range(0, 4)),
      },
      { collapsed: true },
    ),

    Water: folder(
      {
        ...bind("WATER", "enabled"),
        ...bind("WATER", "level", range(-0.05, 0.15, 0.001)),
        ...bind("WATER", "reflection", range(0, 5)),
        ...bind("WATER", "rippleIntensity", range(0, 4)),
        ...bind("WATER", "rippleSpeed", range(0.1, 3)),
        ...bind("WATER", "rippleScale", range(4, 50)),
        ...bind("WATER", "roughness", range(0, 1)),
        ...bind("WATER", "stretch", range(0, 3)),
        ...bind("WATER", "color"),
        ...bind("WATER", "tint"),
        ...bind("WATER", "drips"),
      },
      { collapsed: true },
    ),

    Atmosphere: folder(
      {
        ...bind("ATMOSPHERE", "background"),
        ...bind("ATMOSPHERE", "fogColor"),
        ...bind("ATMOSPHERE", "fogDensity", range(0, 0.15, 0.001)),
        ...bind("ATMOSPHERE", "mistIntensity", range(0, 3)),
        ...bind("ATMOSPHERE", "mistColor"),
        ...bind("ATMOSPHERE", "mistFalloff", range(1, 15)),
        ...bind("ATMOSPHERE", "hazeIntensity", range(0, 2)),
        ...bind("ATMOSPHERE", "hazeColor"),
      },
      { collapsed: true },
    ),

    Post: folder(
      {
        ...bind("POST", "exposure", range(0.1, 3)),
        ...bind("POST", "toneMapping", { options: ["AGX", "ACES_FILMIC", "NEUTRAL", "REINHARD", "CINEON", "LINEAR"] }),
        ...bind("POST", "bloomIntensity", range(0, 5)),
        ...bind("POST", "bloomThreshold", range(0, 3)),
        ...bind("POST", "bloomSmoothing", range(0, 1)),
        ...bind("POST", "bloomRadius", range(0, 1)),
      },
      { collapsed: true },
    ),

    Camera: folder(
      {
        ...bind("PARALLAX", "range", { label: "parallax x / y", step: 0.01 }),
        ...bind("PARALLAX", "damping", range(0.2, 10)),
      },
      { collapsed: true },
    ),

    "Scroll multipliers (heroState.fx)": folder(
      {
        ...fxControl("particleIntensity"),
        ...fxControl("displacement"),
        ...fxControl("cursorStrength"),
        ...fxControl("glowIntensity"),
        ...fxControl("waterIntensity"),
        ...fxControl("rippleIntensity"),
        ...fxControl("awaken"),
        ...fxControl("mist"),
      },
      { collapsed: true },
    ),
  };
}

export default function PortalControls() {
  // Built once: the schema snapshots the config at mount; the panel owns it after.
  const [schema] = useState(createSchema);
  useControls(schema);
  return (
    <Leva
      collapsed={false}
      titleBar={{ title: "Portal hero" }}
      theme={{ sizes: { rootWidth: "340px", controlWidth: "160px" } }}
    />
  );
}
