"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import { ATMOSPHERE, JOURNEY } from "./config";
import useControlsEnabled from "./controls/useControlsEnabled";
import usePointer from "./hooks/usePointer";
import usePortalJourney from "./hooks/usePortalJourney";

const PortalCanvas = dynamic(() => import("./canvas/PortalCanvas"), { ssr: false });
// Leva panel — only downloaded when enabled (dev, or `?controls`).
const PortalControls = dynamic(() => import("./controls/PortalControls"), { ssr: false });
const TunnelControls = dynamic(() => import("./controls/TunnelControls"), { ssr: false });

/**
 * The portal journey: the corridor in WebGL with its fluid-driven particle
 * web, then — scroll-driven (usePortalJourney) — through the portal, down the
 * rock tunnel, to the scratchable Skills Boulder. One canvas throughout.
 *
 * The section is `1 + JOURNEY.scrollLength` screens tall; the stage inside it
 * stays stuck to the viewport while the timeline scrubs.
 *
 *   z0  WebGL canvas
 *   z1  CSS vignette (cheap stand-in for post-processing)
 */
export default function PortalHero() {
  const sectionRef = useRef(null);
  const parallax = usePointer();
  const showControls = useControlsEnabled();
  usePortalJourney(sectionRef);

  return (
    <section
      ref={sectionRef}
      className="relative w-full"
      style={{
        height: `${(1 + JOURNEY.scrollLength) * 100}svh`,
        background: ATMOSPHERE.background,
      }}
      aria-label="Portal environment"
    >
      <div className="sticky top-0 h-svh w-full overflow-hidden">
        <div className="absolute inset-0 z-0">
          <PortalCanvas parallax={parallax} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-1"
          style={{
            background:
              "radial-gradient(120% 95% at 50% 45%, transparent 50%, rgba(3,2,7,0.7) 100%), linear-gradient(to top, rgba(3,2,7,0.3), transparent 22%)",
          }}
        />
      </div>
      {showControls && <PortalControls />}
      {showControls && <TunnelControls />}
    </section>
  );
}
