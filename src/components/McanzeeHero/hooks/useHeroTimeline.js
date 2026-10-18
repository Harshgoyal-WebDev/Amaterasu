"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  MOBILE_QUERY,
  SCROLL,
  STAGE_VALUES,
  getCameraKeyframes,
} from "../config";
import { useConfigVersion } from "../controls/configStore";
import { heroState, resetHeroState } from "../heroState";

gsap.registerPlugin(ScrollTrigger);

/**
 * The hero's single master timeline, scrubbed by one ScrollTrigger.
 *
 * It tweens plain values on `heroState` (read by the R3F scene every frame)
 * and the few DOM layers that sit above the canvas. gsap.matchMedia rebuilds
 * it with mobile keyframes when the breakpoint changes.
 *
 *   ARRIVAL ──── APPROACH ──────────── TRANSITION ──────────
 *   hold         camera glides in,     camera pushes into the lens,
 *                copy fades out,       lens flares,
 *                fog / mist thicken    page colour fades in
 */
export default function useHeroTimeline({
  sectionRef,
  copyRef,
  cueRef,
  whiteoutRef,
  onActiveChange,
}) {
  // Keyframes / stage values are baked into the tweens: rebuild on edits.
  const version = useConfigVersion("CAMERA_KEYFRAMES", "CAMERA", "SCROLL", "STAGE_VALUES", "KNOBS", "ENV_MODEL", "LENS");

  useEffect(() => {
    const mm = gsap.matchMedia();

    mm.add(
      { isMobile: MOBILE_QUERY, isDesktop: `not all and ${MOBILE_QUERY}` },
      (context) => {
        const { isMobile } = context.conditions;
        const keys = getCameraKeyframes(isMobile ? "mobile" : "desktop");
        const { arrival: A, approach: B, transition: C } = SCROLL.stages;
        const cam = heroState.camera;

        resetHeroState(keys.arrival);
        onActiveChange(true);
        gsap.set(whiteoutRef.current, { autoAlpha: 0 });

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top top",
            end: "bottom bottom",
            scrub: SCROLL.scrub,
            // Stop rendering WebGL once the hero has fully handed off.
            onLeave: () => onActiveChange(false),
            onEnterBack: () => onActiveChange(true),
            onUpdate: (self) => {
              heroState.progress = self.progress;
            },
          },
        });

        // ── Stage 1 — Arrival ────────────────────────────────────────────
        tl.addLabel("arrival", 0).to(
          cueRef.current,
          { autoAlpha: 0, duration: A },
          "arrival",
        );

        // ── Stage 2 — Approach ───────────────────────────────────────────
        tl.addLabel("approach", A)
          .to(
            cam,
            { ...keys.approach, duration: B, ease: "power1.inOut" },
            "approach",
          )
          .to(
            heroState,
            { ...STAGE_VALUES.approach, duration: B, ease: "power1.inOut" },
            "approach",
          )
          .to(
            copyRef.current,
            { autoAlpha: 0, y: -60, duration: B * 0.35, ease: "power1.in" },
            "approach",
          );

        // ── Stage 3 — Transition ─────────────────────────────────────────
        const fadeAt = C * STAGE_VALUES.whiteoutStart;

        tl.addLabel("transition", A + B)
          .to(
            cam,
            { ...keys.transition, duration: C, ease: "power2.in" },
            "transition",
          )
          .to(
            heroState,
            { ...STAGE_VALUES.transition, duration: C, ease: "power2.in" },
            "transition",
          )
          .to(
            whiteoutRef.current,
            { autoAlpha: 1, duration: C - fadeAt, ease: "power1.in" },
            `transition+=${fadeAt}`,
          );
      },
    );

    return () => mm.revert();
  }, [sectionRef, copyRef, cueRef, whiteoutRef, onActiveChange, version]);
}
