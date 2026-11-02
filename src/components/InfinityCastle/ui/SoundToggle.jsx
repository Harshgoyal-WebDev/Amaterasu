"use client";

import { useEffect, useRef } from "react";
import { getSound, setSound } from "../audio/sound";
import { journey } from "../state";
import useUiStore from "./useStore";

const BARS = 9;

/**
 * Sound on/off. The Web Audio graph is created on the first click (no
 * autoplay — here or on the summons letter). The toggle also drives the
 * generated layers from the journey (wind with falling, reverb with open
 * space) and plays the castle's events; they are drained even while muted
 * so nothing piles up.
 */
export default function SoundToggle() {
  const on = useUiStore((s) => s.soundOn);
  const bars = useRef([]);

  useEffect(() => {
    let raf;
    let data;
    const tick = (ms) => {
      const a = getSound();
      const events = journey.audioEvents;
      if (a && on) {
        a.update({ speed: journey.speed, fall: journey.fall, openness: journey.void, alive: journey.alive });
        for (const e of events) a.trigger(e.type, e.intensity, e);
      }
      events.length = 0;
      if (a && on) {
        data ??= new Uint8Array(a.analyser.fftSize);
        a.analyser.getByteTimeDomainData(data);
      }
      bars.current.forEach((bar, i) => {
        if (!bar) return;
        let h = 0.22 + 0.12 * Math.sin(ms / 700 + i * 0.7);
        if (on && data) h = 0.18 + Math.min(1, (Math.abs(data[Math.floor((i / BARS) * data.length)] - 128) / 128) * 4.5) * 0.82;
        bar.style.transform = `scaleY(${h.toFixed(3)})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);


  return (
    <button
      type="button"
      onClick={() => setSound(!on)}
      aria-pressed={on}
      aria-label={on ? "Mute sound" : "Play sound"}
      className="ic-serif pointer-events-auto flex items-center gap-3 rounded-full px-2 py-2 text-[9px] uppercase tracking-[0.42em] text-[#f2e4cc]/55 transition-colors hover:text-[#f2e4cc]/90 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#ff9a3c]/60 md:text-[10px]"
    >
      <span className="flex h-4 items-center gap-[3px]" aria-hidden>
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              bars.current[i] = el;
            }}
            className={`h-full w-px origin-center ${on ? "bg-[#ff9a3c]" : "bg-[#f2e4cc]/60"}`}
            style={{ transform: "scaleY(0.25)" }}
          />
        ))}
      </span>
      Sound {on ? "on" : "off"}
    </button>
  );
}
