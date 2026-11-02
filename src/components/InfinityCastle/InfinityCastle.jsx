"use client";

import { Component, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { disposeSound } from "./audio/sound";
import { LOW_QUALITY_QUERY, REDUCED_MOTION_QUERY } from "./config";
import useControlsEnabled from "./controls/useControlsEnabled";
import { InputController } from "./input/InputController";
import { journey, uiStore } from "./state";
import Hud from "./ui/Hud";
import IntroOverlay from "./ui/IntroOverlay";
import StaticFallback from "./ui/StaticFallback";
import SummonsLetter from "./ui/SummonsLetter";
import useMediaQuery from "./ui/useMediaQuery";
import useUiStore from "./ui/useStore";
import "./infinityCastle.css";

// Leva "Sound" panel — only downloaded when enabled (dev, or `?controls`).
const SoundControls = dynamic(() => import("./controls/SoundControls"), { ssr: false });

const ExperienceCanvas = dynamic(() => import("./canvas/ExperienceCanvas"), { ssr: false });

// probed once: every probe creates a WebGL context, and browsers drop the oldest past a limit
let webglSupport = null;
function detectWebGL() {
  if (webglSupport === null) {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      webglSupport = !!gl;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}
const noop = () => () => {};

/** Any error in the 3D layer (context loss at creation, asset failure) → the still version. */
class CanvasBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error("[InfinityCastle] 3D layer failed:", error);
    uiStore.set({ error: String(error?.message || error) });
  }
  render() {
    return this.state.failed ? <StaticFallback reason="error" /> : this.props.children;
  }
}

/**
 * Infinity Castle — page root.
 *
 *   z0   the one WebGL canvas (client only)
 *   z10  vignette + darkness (false-exit blackout, fade-in from black)
 *   z20  intro typography
 *   z30  HUD: place name, ways on, sound
 *   z40  the summons letter (lore + controls) — movement waits for it
 *
 * Input is captured on this element only (wheel / touch) plus a few keys on
 * the window; browser shortcuts, zoom and tab focus keep working. The page
 * itself never scrolls or rubber-bands while the castle is open.
 */
export default function InfinityCastle() {
  const root = useRef(null);
  const veil = useRef(null);
  const webgl = useSyncExternalStore(noop, detectWebGL, () => null);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const lowQuality = useMediaQuery(LOW_QUALITY_QUERY);
  const touch = useMediaQuery("(pointer: coarse)");
  const input = useMemo(() => new InputController(), []);
  const paper = useUiStore((s) => s.paper);
  const showControls = useControlsEnabled();

  useEffect(() => input.hold(paper), [input, paper]);

  // no native page scrolling, overscroll bounce or swipe-to-go-back while here
  useEffect(() => {
    const html = document.documentElement;
    const prev = [html.style.overflow, html.style.overscrollBehavior, document.body.style.overflow];
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    return () => {
      [html.style.overflow, html.style.overscrollBehavior, document.body.style.overflow] = prev;
      disposeSound();
    };
  }, []);

  useEffect(() => {
    input.setReducedMotion(reducedMotion);
  }, [input, reducedMotion]);

  useEffect(() => {
    const el = root.current;
    input.attach(el);
    return () => input.detach();
  }, [input]);

  // darkness: starts black, lifts once the gate is ready; the false exit drives it after that
  useEffect(() => {
    let raf;
    const tick = () => {
      const el = veil.current;
      if (el) {
        const ready = uiStore.get().phase !== "loading";
        const target = ready ? journey.blackout : 1;
        const cur = parseFloat(el.dataset.v || "1");
        const k = ready && !journey.blackout ? 0.025 : 0.35;
        const v = cur + (target - cur) * k;
        el.dataset.v = v.toFixed(4);
        el.style.opacity = v.toFixed(3);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={root}
      className="ic-root fixed inset-0 select-none overflow-hidden bg-[#030202] text-[#f2e4cc]"
      role="application"
      aria-roledescription="3D journey"
      aria-label="Infinity Castle. Scroll, swipe or use the arrow keys to move; left and right choose a way at junctions; Q and E descend or rise."
    >
      {webgl && (
        <CanvasBoundary>
          <ExperienceCanvas input={input} initialTier={lowQuality ? "low" : "high"} reducedMotion={reducedMotion} />
        </CanvasBoundary>
      )}
      {webgl === false && <StaticFallback reason="no-webgl" />}

      <div aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ background: "radial-gradient(125% 95% at 50% 48%, transparent 52%, rgba(2,1,1,0.72) 100%), linear-gradient(to top, rgba(2,1,1,0.55), transparent 22%)" }} />
      <div ref={veil} aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-[#020101]" style={{ opacity: 1 }} />

      {webgl !== false && <IntroOverlay touch={touch} />}
      {webgl !== false && <Hud input={input} touch={touch} />}
      {/* client-only, so it unrolls in front of the reader rather than during page load */}
      {webgl === true && <SummonsLetter touch={touch} />}
      {showControls && <SoundControls />}
    </div>
  );
}
