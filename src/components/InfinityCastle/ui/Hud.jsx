"use client";

import { useEffect, useRef } from "react";
import { journey } from "../state";
import SoundToggle from "./SoundToggle";
import useUiStore from "./useStore";

const GLYPH = { left: "←", forward: "↑", right: "→", up: "△", down: "▽" };
const LABEL = { left: "Left", forward: "Ahead", right: "Right", up: "Rise", down: "Descend" };
const ORDER = ["left", "down", "forward", "up", "right"];

/**
 * Everything on screen after the gate: almost nothing.
 *   top-left      the castle's name, barely there
 *   bottom-left   where you are (a place name, and how many spaces you have
 *                 crossed — a count that never implies an end)
 *   bottom-centre the ways on at a junction (also the touch control)
 *   bottom-right  sound
 */
export default function Hud({ input, touch }) {
  const phase = useUiStore((s) => s.phase);
  const region = useUiStore((s) => s.region);
  const regionSerial = useUiStore((s) => s.regionSerial);
  const junction = useUiStore((s) => s.junction);
  const hintsSeen = useUiStore((s) => s.hintsSeen);
  const counter = useRef(null);

  useEffect(() => {
    let raf;
    let last = -1;
    let lastEl = null;
    const tick = () => {
      // the label remounts with each new region: rewrite into the new element too
      if (counter.current && (journey.chunkCount !== last || counter.current !== lastEl)) {
        last = journey.chunkCount;
        lastEl = counter.current;
        counter.current.textContent = String(last).padStart(3, "0");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const started = phase === "journey";
  const showHud = phase !== "loading";
  const dirs = junction ? ORDER.filter((d) => junction.available.includes(d)) : [];
  const vertical = dirs.includes("up") || dirs.includes("down");

  return (
    <div className={`pointer-events-none absolute inset-0 z-30 transition-opacity duration-[2000ms] ${showHud ? "opacity-100" : "opacity-0"}`}>
      <div className="ic-jp absolute text-[11px] tracking-[0.5em] text-[#f2e4cc]/30" style={{ top: "max(20px, env(safe-area-inset-top))", left: "max(20px, env(safe-area-inset-left))" }}>
        無限城
      </div>

      <div
        className={`absolute transition-opacity duration-[1400ms] ${started && region ? "opacity-100" : "opacity-0"}`}
        style={{ bottom: "max(22px, env(safe-area-inset-bottom))", left: "max(20px, env(safe-area-inset-left))" }}
        aria-live="polite"
      >
        {/* keyed: the place name brightens on every change, then settles back */}
        <div key={regionSerial} className="ic-region flex flex-col gap-1.5">
        <span className="ic-jp text-[18px] leading-none tracking-[0.2em] text-[#f2e4cc]/85 md:text-[22px]">{region?.jp}</span>
        <span className="ic-serif flex items-center gap-3 text-[9px] uppercase tracking-[0.42em] text-[#f2e4cc]/55 md:text-[10px]">
          {region?.en}
          <span className="h-px w-5 bg-[#ff9a3c]/50" aria-hidden />
          <span className="tabular-nums text-[#f2e4cc]/40">
            N° <span ref={counter}>001</span>
          </span>
        </span>
        </div>
      </div>

      <div className="absolute flex flex-col items-end gap-0 md:flex-row md:items-center md:gap-3" style={{ bottom: "max(16px, env(safe-area-inset-bottom))", right: "max(14px, env(safe-area-inset-right))" }}>
        <SoundToggle />
      </div>

      {/* junction: the ways on */}
      <div className={`absolute inset-x-0 flex flex-col items-center gap-3 transition-all duration-700 ${started && junction ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`} style={{ bottom: "max(70px, calc(env(safe-area-inset-bottom) + 58px))" }}>
        {!hintsSeen && junction && (
          <p className="ic-serif max-w-[80vw] text-center text-[9px] uppercase leading-relaxed tracking-[0.4em] text-[#f2e4cc]/55 md:text-[10px]">
            {touch ? "Swipe sideways or tap a way on" : vertical ? "Q / E or ↓ ↑ buttons to descend or rise · ← → to turn" : "Scroll sideways or ← → to choose your way"}
          </p>
        )}
        <div className={`flex items-center gap-2 ${started && junction ? "pointer-events-auto" : ""}`} role="group" aria-label="Choose a way on">
          {dirs.map((d) => {
            const sel = junction?.selected === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => input.choose(d)}
                aria-pressed={sel}
                aria-label={LABEL[d]}
                className={`ic-serif flex h-9 w-9 items-center justify-center rounded-full border text-[13px] transition-all duration-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#ff9a3c]/70 md:h-10 md:w-10 ${
                  sel ? "border-[#ff9a3c]/80 bg-[#ff9a3c]/15 text-[#ffcf96]" : "border-[#f2e4cc]/15 bg-black/20 text-[#f2e4cc]/55 hover:border-[#f2e4cc]/40 hover:text-[#f2e4cc]/85"
                }`}
              >
                {GLYPH[d]}
              </button>
            );
          })}
        </div>
      </div>

      {/* touch: a quiet way to keep walking without gestures */}
      {touch && started && (
        <button
          type="button"
          onClick={() => input.step(1)}
          aria-label="Move forward"
          className="ic-serif pointer-events-auto absolute flex h-10 w-10 items-center justify-center rounded-full border border-[#f2e4cc]/12 bg-black/20 text-[13px] text-[#f2e4cc]/50"
          style={{ bottom: "max(64px, calc(env(safe-area-inset-bottom) + 52px))", right: "max(18px, env(safe-area-inset-right))" }}
        >
          ↑
        </button>
      )}
    </div>
  );
}
