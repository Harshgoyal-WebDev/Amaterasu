"use client";

import { useState } from "react";
import { LevaPanel, button, folder, useControls, useCreateStore } from "leva";
import { TUNNEL_SECTIONS } from "../config";
import { bind, range, serialize } from "./levaBind";

/**
 * A second Leva panel (top-left) just for the void / rock tunnel. Look values
 * (VOID) are live; "Structure" (TUNNEL) rebuilds the rocks / particles.
 * "Copy tunnel config" copies VOID + TUNNEL as JS for config.js.
 */
function createSchema() {
  return {
    "Copy tunnel config": button(() => navigator.clipboard?.writeText(serialize(TUNNEL_SECTIONS))),

    Camera: folder({
      ...bind("VOID", "bank", { ...range(0, 30, 0.5), label: "lean into sway (°)" }),
    }),

    Atmosphere: folder({
      ...bind("VOID", "nebula", { ...range(0, 2), label: "nebula" }),
      ...bind("VOID", "nebulaColor"),
      ...bind("VOID", "nebulaGlow"),
      ...bind("VOID", "fog", range(0, 0.08, 0.001)),
      ...bind("VOID", "peek", { ...range(0, 1), label: "peek (before portal)" }),
    }),

    Light: folder({
      ...bind("VOID", "light", { ...range(0, 600), label: "camera light" }),
      ...bind("VOID", "lightDistance", range(2, 80)),
      ...bind("VOID", "lightColor"),
      ...bind("VOID", "fill", { ...range(0, 1.5), label: "violet fill" }),
    }),

    Rocks: folder({
      ...bind("VOID", "crackGlow", { ...range(0, 4), label: "crack glow" }),
      ...bind("VOID", "spin", { ...range(0, 4), label: "rotation × (all)" }),
      ...bind("VOID", "spinX", { ...range(0, 2, 0.01), label: "rotation x (tumble)" }),
      ...bind("VOID", "spinY", { ...range(0, 2, 0.01), label: "rotation y (turn)" }),
      ...bind("VOID", "spinZ", { ...range(0, 2, 0.01), label: "rotation z (roll)" }),
    }),

    "Dust · smoke": folder({
      ...bind("VOID", "dust", { ...range(0, 6), label: "dust" }),
      ...bind("VOID", "dustColor"),
      ...bind("VOID", "dustShutter", { ...range(0, 0.3, 0.005), label: "dust stretch (shutter s)" }),
      ...bind("VOID", "dustMaxStretch", { ...range(0, 12), label: "max stretch (m)" }),
      ...bind("VOID", "smoke", { ...range(0, 2), label: "smoke" }),
      ...bind("VOID", "smokeColor"),
    }),

    "Screen motion": folder({
      ...bind("VOID", "chromatic", { ...range(0, 0.02, 0.0005), label: "edge RGB split" }),
      ...bind("VOID", "speedChromatic", { ...range(0, 0.03, 0.0005), label: "+ split when moving" }),
      ...bind("VOID", "speedBlur", { ...range(0, 0.2, 0.002), label: "motion blur when moving" }),
      ...bind("VOID", "edgeBlur", { ...range(0, 24, 0.5), label: "edge blur (px)" }),
    }),

    "Structure (rebuilds)": folder(
      {
        ...bind("TUNNEL", "rockDensity", { ...range(0.2, 3), label: "rock amount" }),
        ...bind("TUNNEL", "dust", { ...range(0, 8000, 100), label: "dust count" }),
        ...bind("TUNNEL", "smokeCount", range(0, 60, 1)),
        ...bind("TUNNEL", "ahead", { ...range(10, 130, 1), label: "rocks drawn ahead (m)" }),
      },
      { collapsed: true },
    ),
  };
}

export default function TunnelControls() {
  const store = useCreateStore();
  const [schema] = useState(createSchema);
  useControls(schema, { store });
  return (
    <div style={{ position: "fixed", top: 12, left: 12, width: 320, zIndex: 1000 }}>
      <LevaPanel store={store} fill collapsed={false} titleBar={{ title: "Tunnel" }} />
    </div>
  );
}
