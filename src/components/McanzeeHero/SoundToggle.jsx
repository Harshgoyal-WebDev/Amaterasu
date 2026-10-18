"use client";

import { useEffect, useRef, useState } from "react";
import { STAGE_VALUES } from "./config";
import { heroState, soundBus } from "./heroState";
import { createAmbientSpaceMusic } from "./audio/ambientSpaceMusic";

const BARS = 18;

/**
 * Music on/off with a live waveform. The Web Audio graph is created lazily on
 * the first click (browsers block audio until a user gesture). While playing,
 * the track's chord changes drive the portal soundwave, and the mix opens up
 * as the camera approaches the lens.
 */
export default function SoundToggle() {
  const [on, setOn] = useState(false);
  const soundRef = useRef(null);
  const barsRef = useRef([]);

  // Waveform animation: real analyser data when on, a gentle idle wave when off.
  useEffect(() => {
    let raf;
    let data;
    const peak = STAGE_VALUES.transition.lensGlow;
    const tick = (ms) => {
      const sound = soundRef.current;
      if (on && sound) {
        data ??= new Uint8Array(sound.analyser.fftSize);
        sound.analyser.getByteTimeDomainData(data);
        sound.setIntensity((heroState.lensGlow - 1) / (peak - 1));
      }
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        let h;
        if (on && data) {
          const v = Math.abs(data[Math.floor((i / BARS) * data.length)] - 128) / 128;
          h = 0.15 + Math.min(v * 2.6, 0.85); // sustained pads: gentle gain
        } else {
          h = 0.25 + 0.15 * Math.sin(ms / 600 + i * 0.6);
        }
        bar.style.transform = `scaleY(${h})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  useEffect(() => {
    soundBus.playing = on;
  }, [on]);

  useEffect(
    () => () => {
      soundBus.playing = false;
      soundRef.current?.dispose();
    },
    [],
  );

  const toggle = () => {
    soundRef.current ??= createAmbientSpaceMusic({
      // Fire the visual pulse exactly when the chord change is heard.
      onPulse: (delay) =>
        setTimeout(() => {
          soundBus.pulseAt = performance.now() / 1000;
        }, delay * 1000),
    });
    if (on) soundRef.current.stop();
    else soundRef.current.start();
    setOn(!on);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Mute music" : "Play music"}
      className="pointer-events-auto flex items-center gap-4 text-[10px] uppercase tracking-[0.3em] text-white/85 transition-colors hover:text-white md:text-[11px]"
    >
      <span className="flex h-6 items-center gap-[3px]" aria-hidden>
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              barsRef.current[i] = el;
            }}
            className={`h-full w-[2px] origin-center rounded-full transition-colors ${on ? "bg-[#6f86ff]" : "bg-white/70"}`}
            style={{ transform: "scaleY(0.25)" }}
          />
        ))}
      </span>
      Sound {on ? "on" : "off"}
    </button>
  );
}
