"use client";

import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { setMusic, setSound } from "../audio/sound";
import { uiStore } from "../state";
import useUiStore from "./useStore";

// torn edge: a fixed, irregular outline (deterministic, so server and client agree)
const EDGE = (() => {
  const jag = (i) => (Math.sin(i * 12.9898) * 43758.5453) % 1;
  const pts = [];
  const N = 22;
  for (let i = 0; i <= N; i++)
    pts.push(`${(i / N) * 100}% ${(0.4 + Math.abs(jag(i)) * 1.4).toFixed(2)}%`);
  for (let i = 0; i <= N; i++)
    pts.push(
      `${(99.6 - Math.abs(jag(i + 40)) * 1.3).toFixed(2)}% ${(i / N) * 100}%`,
    );
  for (let i = N; i >= 0; i--)
    pts.push(
      `${(i / N) * 100}% ${(99.6 - Math.abs(jag(i + 80)) * 1.4).toFixed(2)}%`,
    );
  for (let i = N; i >= 0; i--)
    pts.push(
      `${(0.4 + Math.abs(jag(i + 120)) * 1.3).toFixed(2)}% ${(i / N) * 100}%`,
    );
  return `polygon(${pts.join(", ")})`;
})();

const DESKTOP_LAWS = [
  [
    ["Scroll", "W", "↑"],
    "Walk deeper. Scroll harder and you will run — the castle does not mind.",
  ],
  [
    ["Scroll back", "S", "↓"],
    "Retreat the way you came, for as long as that way still exists.",
  ],
  [
    ["←", "→", "A", "D"],
    "Where the halls divide, choose your path. Choose quickly.",
  ],
  [["Q", "E"], "Descend or rise where stairwells and crossroads allow."],
  [["Space"], "A single stride."],
  [["Mouse"], "Turn your eyes. Something is always watching from the edges."],
];

const TOUCH_LAWS = [
  [["Swipe up"], "Walk deeper. Swipe harder and you will run."],
  [
    ["Swipe down"],
    "Retreat the way you came, for as long as that way still exists.",
  ],
  [
    ["Swipe ← →", "◁ ▷"],
    "Where the halls divide, choose your path. Choose quickly.",
  ],
  [["△ ▽"], "Descend or rise where stairwells and crossroads allow."],
];

/**
 * The summons: an aged letter laid over the gate when the experience opens
 * (while the castle loads behind it). Lore, then the laws — the controls.
 * It unrolls between two rods on arrival and rolls back up when put away.
 * Movement waits until then; "Enter with sound" starts the audio
 * from the click itself.
 */
export default function SummonsLetter({ touch }) {
  const open = useUiStore((s) => s.paper);
  const phase = useUiStore((s) => s.phase);
  const error = useUiStore((s) => s.error);
  const { progress } = useProgress();
  const [closing, setClosing] = useState(false);
  const enterBtn = useRef(null);
  const ready = phase !== "loading";

  useEffect(() => {
    if (ready && open) enterBtn.current?.focus({ preventScroll: true });
  }, [ready, open]);

  if (!open || error) return null; // a failed castle shows its still fallback instead

  const enter = (withSound) => {
    if (!ready || closing) return;
    if (withSound) {
      setSound(true);
      setMusic(true);
    }
    setClosing(true);
    setTimeout(() => uiStore.set({ paper: false }), 1400);
  };

  const laws = touch ? TOUCH_LAWS : DESKTOP_LAWS;

  return (
    <div
      className={`ic-letter-backdrop absolute inset-0 z-40 flex items-center justify-center px-4 py-5 md:py-8 ${closing ? "is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ic-letter-title"
    >
      <div className="ic-letter relative w-full max-w-[680px]">
        <span aria-hidden className="ic-rod ic-rod-top" />
        <div className="ic-unroll">
          <div
            className="ic-paper ic-serif relative max-h-[86dvh] overflow-y-auto px-7 pb-9 pt-10 md:px-14 md:pb-12 md:pt-14"
            style={{ clipPath: EDGE }}
            data-ic-scroll
          >
            <span
              aria-hidden
              className="ic-jp ic-ink-red pointer-events-none absolute right-4 top-12 hidden text-[13px] leading-[1.9] tracking-[0.5em] opacity-70 md:block"
              style={{ writingMode: "vertical-rl" }}
            >
              鬼の棲まう城　出口なし
            </span>

            <header className="text-center">
              <p className="ic-jp ic-ink-red text-[30px] leading-none tracking-[0.35em] md:text-[40px]">
                無限城
              </p>
              <h2
                id="ic-letter-title"
                className="mt-3 text-[12px] font-medium uppercase tracking-[0.55em] md:text-[13px]"
              >
                The Infinity Castle
              </h2>
              <p className="mt-2 text-[13px] italic opacity-75 md:text-[14px]">
                a summons, written in a hand that is not human
              </p>
              <span
                aria-hidden
                className="ic-rule mx-auto mt-5 block h-px w-40"
              />
            </header>

            <div className="ic-ink mt-6 space-y-4 text-[15.5px] leading-[1.62] md:text-[17px]">
              <p className="ic-dropcap">
                You did not find this place. It found you. Beneath the
                floorboards of the waking world hangs a fortress with no floor
                and no sky — the Infinity Castle, lair of the Demon King, where
                the night never thins into morning.
              </p>
              <p>
                Its halls fold upon themselves like paper crushed in a fist.
                Stairs climb into ceilings; ceilings open onto chasms; corridors
                run on long after they should have ended. A single string of the{" "}
                <em>biwa</em> decides where you stand — when it sounds, rooms
                are torn loose and set down elsewhere, doors become walls, and
                the way you came is gone.
              </p>
              <p>
                The lanterns burn, but not for you. They burn so that what
                dwells in the dark may watch you come. No map survives a night
                here. No one who has walked these halls has walked out of them.
              </p>
            </div>

            <section className="mt-8" aria-labelledby="ic-laws">
              <h3
                id="ic-laws"
                className="ic-ink-red text-center text-[11px] font-medium uppercase tracking-[0.6em] md:text-[12px]"
              >
                The Laws of the Castle{" "}
                <span className="ic-jp ml-1 tracking-[0.3em]">掟</span>
              </h3>
              <ul className="ic-ink mt-4 space-y-2.5 text-[14.5px] leading-snug md:text-[15.5px]">
                {laws.map(([keys, text]) => (
                  <li
                    key={text}
                    className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4"
                  >
                    <span className="flex shrink-0 flex-wrap gap-1.5 sm:w-[168px] sm:justify-end">
                      {keys.map((k) => (
                        <kbd key={k} className="ic-key">
                          {k}
                        </kbd>
                      ))}
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
                <li className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                  <span className="flex shrink-0 sm:w-[168px] sm:justify-end">
                    <kbd className="ic-key ic-key-red">The Fall</kbd>
                  </span>
                  <span>
                    When the floor gives way, you fall. Nothing you do will slow
                    it. Do not scream; it only echoes.
                  </span>
                </li>
              </ul>
            </section>

            <p className="ic-ink mt-8 text-center text-[15px] italic md:text-[16px]">
              There is no exit. If you see one, it is lying.
            </p>

            <div className="relative mt-7 flex items-end justify-between gap-4">
              <p className="ic-ink text-[13px] leading-snug opacity-80 md:text-[14px]">
                — sealed by the will of the Demon King
                <br />
                <span className="ic-jp text-[12px] tracking-[0.3em]">
                  鬼舞辻
                </span>
              </p>
              <span
                aria-hidden
                className="ic-seal ic-jp grid h-16 w-16 shrink-0 place-items-center text-[30px] md:h-[76px] md:w-[76px] md:text-[36px]"
              >
                鬼
              </span>
            </div>

            <div className="mt-8 flex flex-col items-center gap-3">
              {ready ? (
                <>
                  <button
                    ref={enterBtn}
                    type="button"
                    onClick={() => enter(true)}
                    className="ic-enter"
                  >
                    Accept the summons
                    <span className="mt-0.5 block text-[9px] tracking-[0.45em] opacity-70">
                      with sound
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => enter(false)}
                    className="text-[10px] uppercase tracking-[0.45em] underline-offset-4 opacity-70 transition-opacity hover:underline hover:opacity-100 focus-visible:underline focus-visible:outline-none"
                  >
                    Enter in silence
                  </button>
                </>
              ) : (
                <p
                  className="text-[11px] uppercase tracking-[0.5em] opacity-70"
                  aria-live="polite"
                >
                  The castle assembles · {Math.round(progress)}%
                </p>
              )}
            </div>
          </div>
        </div>
        <span aria-hidden className="ic-rod ic-rod-bottom" />
      </div>
    </div>
  );
}
