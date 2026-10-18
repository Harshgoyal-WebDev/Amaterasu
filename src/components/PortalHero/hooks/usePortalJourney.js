"use client";

import { useEffect } from "react";
import { useLenis } from "lenis/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { JOURNEY, REDUCED_MOTION_QUERY, TUNNEL, WARP } from "../config";
import { crossingProgress, knotS, pace, progressAtZ, sampleJourney } from "../canvas/journey/journeyPath";
import { heroState } from "../state";

gsap.registerPlugin(ScrollTrigger);
// Mobile URL-bar show/hide shouldn't re-measure the journey mid-scroll.
ScrollTrigger.config({ ignoreMobileResize: true });

const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/* Stage markers in scroll progress, derived from the actual path. */
const P_TUNNEL_IN = progressAtZ(-11.2); // camera inside the opening: the void starts to brighten
const P_HERO_OUT = progressAtZ(-16.5); // back wall 2 m behind the camera: corridor hidden
const P_VOID = P_HERO_OUT + 0.03; // lights / fog fully switched to the void
const P_ROCKS_OUT = (() => {
  // a little after the camera has passed the last rocks
  const sLast = knotS(TUNNEL.toKnot) + 0.02;
  let p = JOURNEY.stages.fall[0];
  while (p < 1 && pace(p) < sLast) p += 0.002;
  return Math.min(p + 0.04, 0.99);
})();
const P_BOULDER_IN = progressAtZ(-50); // fog still hides it here
const [A0, A1] = JOURNEY.stages.approach;
const [ARR0] = JOURNEY.stages.arrival;
// autoscroll from just past the rim (the tunnel is on screen from here)
const P_AUTO_FROM = crossingProgress + 0.008;
const TRIGGER_ID = "portal-journey";

/**
 * Write the whole journey state for scroll progress p. Pure function of p:
 * scrolling back up reverses everything exactly.
 */
function applyJourney(p, motion) {
  const j = heroState.journey;
  const fx = heroState.fx;
  const E = JOURNEY.effects;
  j.progress = p;
  sampleJourney(p, heroState.camera.position, heroState.camera.target);

  // which worlds are drawn (and simulated)
  j.hero = p < P_HERO_OUT;
  j.tunnel = p < P_ROCKS_OUT; // glimpsed through the portal from the start
  j.reveal = smooth(P_TUNNEL_IN, crossingProgress + WARP.halfWidth * 0.5, p); // dim → full void
  j.motionFx = motion;
  j.boulder = p > P_BOULDER_IN;
  j.void = smooth(P_HERO_OUT, P_VOID, p);
  j.arrival = smooth(ARR0, 1, p);
  j.arrived = p > 0.985;

  // portal crossing: a short bell around the moment we pass the rim
  const d = Math.abs(p - crossingProgress) / WARP.halfWidth;
  const bell = d < 1 ? 1 - d * d * (3 - 2 * d) : 0;
  j.warp = bell * motion;

  // hero energy: awakens during the approach, brightest as we cross
  const awaken = smooth(A0 + 0.05, A1, p);
  fx.awaken = awaken * E.awaken;
  fx.mist = lerp(1, E.mist, awaken);
  fx.waterIntensity = lerp(1, E.water, awaken);
  fx.glowIntensity = lerp(1, E.glowAwaken, smooth(A0, A1, p)) * lerp(1, WARP.rimGlow, bell);
  fx.ambient = lerp(1, JOURNEY.ambientAfterPortal, j.void);

  // cursor parallax: calmer while falling, a little back at the boulder
  heroState.camera.parallax = lerp(lerp(1, JOURNEY.parallax.tunnel, smooth(A1, P_HERO_OUT, p)), JOURNEY.parallax.arrival, j.arrival);
}

/**
 * The scroll journey (see JOURNEY in config.js): one timeline, scrubbed by
 * one ScrollTrigger over the tall journey section (the canvas stage inside
 * it is sticky; Lenis drives the scroll). The timeline tweens a single
 * progress value; everything else is derived from it in `applyJourney`.
 *
 * Reduced motion keeps the journey (it is the content) but without the
 * crossing distortion; effect animation is already slowed by FxClock.
 *
 * Next stage (Projects): extend JOURNEY.path / keys past the boulder, or hand
 * off to normal document flow after this section.
 */
export default function usePortalJourney(sectionRef) {
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const fx = heroState.fx;
    const rest = { ...fx };
    const mm = gsap.matchMedia();

    mm.add({ reduce: REDUCED_MOTION_QUERY, full: `not all and ${REDUCED_MOTION_QUERY}` }, (context) => {
      const motion = context.conditions.reduce ? 0 : 1;
      const state = { p: 0 };
      applyJourney(0, motion);

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          id: TRIGGER_ID,
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: context.conditions.reduce ? true : JOURNEY.scrub,
          invalidateOnRefresh: true,
        },
      });
      tl.to(state, { p: 1, duration: 1, onUpdate: () => applyJourney(state.p, motion) });

      return () => {
        Object.assign(fx, rest);
        applyJourney(0, 0);
      };
    });

    return () => mm.revert();
  }, [sectionRef]);

  useTunnelAutoScroll();
}

/**
 * Inside the tunnel, stopping lets the fall carry on: after a short pause
 * the page glides (via Lenis) to the end of the tunnel. Any scroll input —
 * wheel, touch, keys, scrollbar — hands control straight back; stop again
 * and it resumes. Off for reduced motion.
 */
function useTunnelAutoScroll() {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis || window.matchMedia(REDUCED_MOTION_QUERY).matches) return;
    const A = JOURNEY.autoScroll;
    let auto = false;
    let lastInput = performance.now();

    // Wheel: Lenis applies it and replaces the glide by itself — just hand
    // control back (stopping here would throw the user's wheel away).
    const onWheel = () => {
      lastInput = performance.now();
      auto = false;
    };
    // Touch / keys / scrollbar scroll natively and would fight the glide: stop it.
    const cancel = () => {
      lastInput = performance.now();
      if (!auto) return;
      auto = false;
      lenis.scrollTo(lenis.scroll, { immediate: true, force: true });
    };
    // native scrolling (scrollbar drag, keyboard paging) counts as input too;
    // Lenis' own smoothing tail after a wheel does not
    const onScroll = () => {
      if (!auto && lenis.isScrolling === "native") lastInput = performance.now();
    };
    const tick = () => {
      if (auto) return;
      const st = ScrollTrigger.getById(TRIGGER_ID);
      if (!st || performance.now() - lastInput < A.delay * 1000 || Math.abs(lenis.velocity) > 1.5) return;
      const p = st.progress;
      if (p <= P_AUTO_FROM || p >= A.to - 0.004) return;
      const target = st.start + (st.end - st.start) * A.to;
      const screens = (target - lenis.scroll) / window.innerHeight;
      auto = true;
      lenis.scrollTo(target, {
        duration: Math.max(0.6, screens / A.screensPerSecond),
        easing: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t), // gentle start and landing
        onComplete: () => {
          auto = false;
          lastInput = performance.now();
        },
      });
    };

    const input = { passive: true };
    window.addEventListener("wheel", onWheel, input);
    window.addEventListener("touchstart", cancel, input);
    window.addEventListener("pointerdown", cancel, input);
    window.addEventListener("keydown", cancel);
    lenis.on("scroll", onScroll);
    gsap.ticker.add(tick);
    return () => {
      window.removeEventListener("wheel", onWheel, input);
      window.removeEventListener("touchstart", cancel, input);
      window.removeEventListener("pointerdown", cancel, input);
      window.removeEventListener("keydown", cancel);
      lenis.off("scroll", onScroll);
      gsap.ticker.remove(tick);
    };
  }, [lenis]);
}
