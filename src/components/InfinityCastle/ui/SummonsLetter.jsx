"use client";

import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { setSound } from "../audio/sound";
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
  [["Scroll", "W"], "Walk deeper — faster, and you run"],
  [["S"], "Retreat, while the way still exists"],
  [["←", "→"], "Choose your way where halls divide"],
  [["Q", "E"], "Descend or rise at stairs"],
  [["Mouse"], "Look around"],
];

const TOUCH_LAWS = [
  [["Swipe up"], "Walk deeper — faster, and you run"],
  [["Swipe down"], "Retreat, while the way still exists"],
  [["◁", "▷"], "Choose your way where halls divide"],
  [["△", "▽"], "Descend or rise at stairs"],
];

/**
 * The opening: a loader while the castle assembles, then "Enter the castle".
 * Entering unrolls the summons — a short letter between two rods: a little
 * lore, the laws (controls). It rolls back up when accepted; movement waits
 * until then. "Accept the summons" starts the audio from the click itself.
 */
export default function SummonsLetter({ touch }) {
  const open = useUiStore((s) => s.paper);
  const phase = useUiStore((s) => s.phase);
  const error = useUiStore((s) => s.error);
  const { progress } = useProgress();
  const [unrolled, setUnrolled] = useState(false);
  const [closing, setClosing] = useState(false);
  const enterBtn = useRef(null);
  const acceptBtn = useRef(null);
  const ready = phase !== "loading";

  useEffect(() => {
    (unrolled ? acceptBtn : enterBtn).current?.focus({ preventScroll: true });
  }, [ready, unrolled]);

  if (!open || error) return null; // a failed castle shows its still fallback instead

  const accept = (withSound) => {
    if (closing) return;
    if (withSound) setSound(true);
    setClosing(true);
    setTimeout(() => uiStore.set({ paper: false }), 1400);
  };

  const laws = touch ? TOUCH_LAWS : DESKTOP_LAWS;

  return (
    <div
      className={`ic-letter-backdrop absolute inset-0 z-40 flex items-center justify-center px-4 py-5 md:py-8 ${closing ? "is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={unrolled ? "ic-letter-title" : "ic-loader-title"}
    >
      {!unrolled ? (
        <div className="ic-loader ic-serif flex flex-col items-center text-center text-[#f2e4cc]">
          <p className="ic-jp text-[34px] leading-none tracking-[0.4em] text-[#f2e4cc]/85 md:text-[44px]" aria-hidden>
            無限城
          </p>
          <h2 id="ic-loader-title" className="mt-4 text-[11px] uppercase tracking-[0.6em] text-[#f2e4cc]/55 md:text-[12px]">
            The Infinity Castle
          </h2>
          <span className="mt-9 block h-px w-48 overflow-hidden bg-[#f2e4cc]/10" aria-hidden>
            <span className="block h-full bg-[#ff9a3c]/80 transition-[width] duration-500 ease-out" style={{ width: `${ready ? 100 : Math.max(4, progress)}%` }} />
          </span>
          <div className="mt-8 flex h-12 items-center">
            {ready ? (
              <button ref={enterBtn} type="button" onClick={() => setUnrolled(true)} className="ic-enter-castle">
                Enter the castle
              </button>
            ) : (
              <p className="text-[10px] uppercase tracking-[0.5em] text-[#f2e4cc]/45" aria-live="polite">
                The castle assembles · {Math.round(progress)}%
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="ic-letter relative w-full max-w-[600px]">
          <span aria-hidden className="ic-rod ic-rod-top" />
          <div className="ic-unroll">
            <div className="ic-paper ic-serif relative max-h-[86dvh] overflow-y-auto px-7 pb-8 pt-8 md:px-12 md:pb-9 md:pt-10" style={{ clipPath: EDGE }} data-ic-scroll>
              <header className="text-center">
                <p className="ic-jp ic-ink-red text-[26px] leading-none tracking-[0.35em] md:text-[34px]">無限城</p>
                <h2 id="ic-letter-title" className="mt-2.5 text-[11px] font-medium uppercase tracking-[0.55em] md:text-[12px]">
                  The Infinity Castle
                </h2>
                <span aria-hidden className="ic-rule mx-auto mt-4 block h-px w-36" />
              </header>

              <p className="ic-ink ic-dropcap mt-5 text-[15px] leading-[1.55] md:text-[16px]">
                You did not find this place. It found you. Beneath the waking world hangs the lair of the Demon King - halls that fold upon themselves, stairs that climb into ceilings, rooms torn loose at the sound of a <em>biwa</em>. No one who has walked here has walked out.
              </p>

              <section className="mt-6" aria-labelledby="ic-laws">
                <h3 id="ic-laws" className="ic-ink-red text-center text-[10px] font-medium uppercase tracking-[0.6em] md:text-[11px]">
                  The Laws <span className="ic-jp ml-1 tracking-[0.3em]">掟</span>
                </h3>
                <ul className="ic-ink mt-3 grid gap-x-6 gap-y-2 text-[13.5px] leading-snug sm:grid-cols-2 md:text-[14px]">
                  {laws.map(([keys, text]) => (
                    <li key={text} className="flex items-baseline gap-2.5">
                      <span className="flex shrink-0 gap-1">
                        {keys.map((k) => (
                          <kbd key={k} className="ic-key">
                            {k}
                          </kbd>
                        ))}
                      </span>
                      <span>{text}</span>
                    </li>
                  ))}
                  <li className="flex items-baseline gap-2.5">
                    <kbd className="ic-key ic-key-red shrink-0">The Fall</kbd>
                    <span>Nothing you do will slow it</span>
                  </li>
                </ul>
              </section>

              <div className="mt-6 flex items-center justify-between gap-4">
                <p className="ic-ink text-[14px] italic leading-snug md:text-[15px]">
                  There is no exit.
                  <br />
                  If you see one, it is lying.
                </p>
               
              </div>

              <div className="mt-6 flex flex-col items-center gap-3">
                <button ref={acceptBtn} type="button" onClick={() => accept(true)} className="ic-enter cursor-pointer">
                  Accept the summon
                  <span className="mt-0.5 block text-[9px] tracking-[0.45em] opacity-70">with sound</span>
                </button>
                <button
                  type="button"
                  onClick={() => accept(false)}
                  className="text-[10px] uppercase tracking-[0.1em] underline-offset-4 opacity-70 cursor-pointer transition-opacity hover:underline hover:opacity-100 focus-visible:underline focus-visible:outline-none"
                >
                  Enter in silence
                </button>
              </div>
            </div>
          </div>
          <span aria-hidden className="ic-rod ic-rod-bottom" />
        </div>
      )}
    </div>
  );
}
