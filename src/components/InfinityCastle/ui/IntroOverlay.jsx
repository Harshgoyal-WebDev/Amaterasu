"use client";

import { useEffect, useRef } from "react";
import { useProgress } from "@react-three/drei";
import { journey } from "../state";
import useUiStore from "./useStore";

/**
 * Stage 01 typography: a loading line while the castle assembles, then
 * "YOU HAVE BEEN SUMMONED." / "SCROLL TO ENTER" in the lower third — never
 * over the gate itself. Fades with the first metres of the journey.
 */
export default function IntroOverlay({ touch }) {
  const phase = useUiStore((s) => s.phase);
  const error = useUiStore((s) => s.error);
  const paper = useUiStore((s) => s.paper);
  const { progress } = useProgress();
  const wrap = useRef(null);

  useEffect(() => {
    let raf;
    let last = -1;
    const tick = () => {
      const el = wrap.current;
      const p = journey.started ? journey.progress : 0;
      // only touch the DOM when it changes (it is hidden for almost the whole journey)
      if (el && p !== last) {
        last = p;
        const o = Math.max(0, 1 - p * 22);
        el.style.opacity = String(o);
        el.style.transform = `translate3d(0, ${(-p * 120).toFixed(1)}px, 0)`;
        el.style.visibility = o < 0.01 ? "hidden" : "visible";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const loading = phase === "loading";
  return (
    <div ref={wrap} className="pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center text-center" style={{ bottom: "max(15vh, calc(env(safe-area-inset-bottom) + 96px))" }} aria-live="polite">
      <div className={`flex flex-col items-center transition-opacity duration-[1600ms] ease-out ${loading ? "opacity-100" : "pointer-events-none absolute opacity-0"}`}>
        <span className="ic-jp text-[13px] tracking-[0.6em] text-[#f2e4cc]/55">無限城</span>
        <span className="mt-5 block h-px w-32 overflow-hidden bg-[#f2e4cc]/10">
          <span className="block h-full bg-[#ff9a3c]/80 transition-[width] duration-500 ease-out" style={{ width: `${Math.max(4, progress)}%` }} />
        </span>
        <span className="ic-serif mt-4 text-[10px] uppercase tracking-[0.5em] text-[#f2e4cc]/40">{error ? "The castle could not open" : "The castle assembles"}</span>
      </div>

      <div className={`flex flex-col items-center transition-all duration-[2200ms] ease-out ${loading || paper ? "translate-y-3 opacity-0" : "translate-y-0 opacity-100"}`}>
        <h1 className="ic-serif text-[15px] font-normal uppercase tracking-[0.46em] text-[#f2e4cc]/90 md:text-[21px]" style={{ textShadow: "0 0 24px rgba(255,154,60,0.18)" }}>
          You have been summoned.
        </h1>
        <p className="ic-serif mt-6 flex flex-col items-center gap-3 text-[9px] uppercase tracking-[0.62em] text-[#f2e4cc]/50 md:text-[10px]">
          {touch ? "Swipe up to enter" : "Scroll to enter"}
          <span className="ic-cue block h-9 w-px bg-gradient-to-b from-[#ff9a3c]/0 via-[#ff9a3c]/70 to-[#ff9a3c]/0" />
        </p>
      </div>
    </div>
  );
}
