"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { COLORS, SCROLL } from "./config";
import { useConfigVersion } from "./controls/configStore";
import useControlsEnabled from "./controls/useControlsEnabled";
import HeroOverlay from "./HeroOverlay";
import useHeroTimeline from "./hooks/useHeroTimeline";
import usePointerParallax from "./hooks/usePointerParallax";

const HeroCanvas = dynamic(() => import("./canvas/HeroCanvas"), { ssr: false });
// Leva panel for every config value — only downloaded when enabled.
const HeroControls = dynamic(() => import("./controls/HeroControls"), { ssr: false });

/**
 * Tall scroll section with a sticky full-screen stage:
 *
 *   z0  WebGL canvas (3D environment only)
 *   z1  CSS vignette / foreground shade (free "post-processing")
 *   z2  HTML typography + UI
 *   z3  fade-out layer that hands off to the 2D site
 */
export default function McanzeeHero() {
  const sectionRef = useRef(null);
  const copyRef = useRef(null);
  const cueRef = useRef(null);
  const whiteoutRef = useRef(null);
  const [active, setActive] = useState(true);
  const showControls = useControlsEnabled();
  useConfigVersion("SCROLL", "COLORS"); // section height + DOM colours are live

  const onActiveChange = useCallback((value) => setActive(value), []);
  const parallax = usePointerParallax();
  useHeroTimeline({ sectionRef, copyRef, cueRef, whiteoutRef, onActiveChange });

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ height: `${SCROLL.sectionHeightVh}vh` }}
      aria-label="MCanzee — Ideas into worlds"
    >
      <div
        className="sticky top-0 h-svh w-full overflow-hidden"
        style={{ background: `linear-gradient(to bottom, ${COLORS.skyZenith}, ${COLORS.fog} 70%, #20232b)` }}
      >
        <div className="absolute inset-0 z-0">
          <HeroCanvas active={active} parallax={parallax} />
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-1"
          style={{
            background:
              "radial-gradient(120% 90% at 55% 40%, transparent 55%, rgba(8,10,18,0.35) 100%), linear-gradient(to top, rgba(6,8,14,0.45), transparent 28%)",
          }}
        />

        <HeroOverlay copyRef={copyRef} cueRef={cueRef} />

        <div
          ref={whiteoutRef}
          aria-hidden
          className="pointer-events-none invisible absolute inset-0 z-3 opacity-0"
          style={{
            background: `radial-gradient(circle at 60% 50%, #ffffff, ${COLORS.transition} 70%)`,
          }}
        />
      </div>
      {showControls && <HeroControls />}
    </section>
  );
}
