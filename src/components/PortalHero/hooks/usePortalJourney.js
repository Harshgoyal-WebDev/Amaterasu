"use client";

import { useEffect } from "react";
import { useLenis } from "lenis/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { JOURNEY, REDUCED_MOTION_QUERY, WARP } from "../config";
import { crossingProgress, marks, pathLength, progressAtZ, progressOf, sampleJourney } from "../canvas/journey/journeyPath";
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
const P_VOID = P_HERO_OUT + 0.025; // lights / fog fully switched to the void
const [A0, A1] = JOURNEY.stages.approach;
const P_EMERGE = progressOf("emerge");
const P_STOP = progressOf("stop"); // in front of the boulder: scroll locks here until it breaks
// autoscroll from just past the rim (the tunnel is on screen from here)
const P_AUTO_FROM = crossingProgress + 0.008;
const TRIGGER_ID = "portal-journey";
const BOULDER_NEAR = 70 / pathLength; // the boulder (and its fragments) are drawn within 70 m of it

/**
 * Write the whole journey state for scroll progress p. Pure function of p
 * (+ whether the boulder has broken): scrolling back up reverses everything.
 */
function applyJourney(p, motion) {
  const j = heroState.journey;
  const fx = heroState.fx;
  const E = JOURNEY.effects;
  j.progress = p;
  const { s, bank } = sampleJourney(p, heroState.camera.position, heroState.camera.target);
  heroState.camera.bank = bank * motion;

  // which worlds are drawn (and simulated)
  j.hero = p < P_HERO_OUT;
  j.tunnel = true; // glimpsed through the portal from the start, never empties
  j.reveal = smooth(P_TUNNEL_IN, crossingProgress + WARP.halfWidth * 0.5, p); // dim → full void
  j.motionFx = motion;
  j.boulder = Math.abs(s - marks.stop) < BOULDER_NEAR;
  j.void = smooth(P_HERO_OUT, P_VOID, p);
  // settling in front of the boulder, then easing away again once it has burst
  j.arrival = smooth(P_EMERGE, P_STOP, p) * (1 - smooth(P_STOP + 0.004, P_STOP + 0.05, p));
  j.arrived = Math.abs(p - P_STOP) < 0.004;

  // portal crossing: a short bell around the moment we pass the rim
  const d = Math.abs(p - crossingProgress) / WARP.halfWidth;
  j.warp = (d < 1 ? 1 - d * d * (3 - 2 * d) : 0) * motion;

  // hero energy: awakens during the approach (no glow pump at the crossing)
  const awaken = smooth(A0 + 0.04, A1, p);
  fx.awaken = awaken * E.awaken;
  fx.mist = lerp(1, E.mist, awaken);
  fx.waterIntensity = lerp(1, E.water, awaken);
  fx.glowIntensity = lerp(1, E.glowAwaken, smooth(A0, A1, p));
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
 * crossing distortion, banking or autoscroll.
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

  useBoulderLock();
  useTunnelAutoScroll();
}

/** Scroll position (px) of a journey progress value. */
function scrollOf(p) {
  const st = ScrollTrigger.getById(TRIGGER_ID);
  return st ? st.start + (st.end - st.start) * p : null;
}

/**
 * The boulder is a hard stop: until it has burst, the page can't be scrolled
 * past it (wheel input that would pass it glides into the stop instead;
 * native scrolling — touch, scrollbar — is clamped). Scrolling back up is
 * always free. Once `heroState.journey.broken`, the stop is gone.
 */
function useBoulderLock() {
  const lenis = useLenis();
  useEffect(() => (lenis ? installBoulderLock(lenis) : undefined), [lenis]);
}

function installBoulderLock(lenis) {
  const previous = lenis.options.virtualScroll;
  lenis.options.virtualScroll = (data) => {
    if (heroState.journey.broken || data.deltaY <= 0) return true;
    const stop = scrollOf(P_STOP);
    if (stop === null || lenis.targetScroll + data.deltaY <= stop) return true;
    if (lenis.targetScroll < stop - 0.5) lenis.scrollTo(stop, { programmatic: false }); // ease into the stop
    data.event.preventDefault?.();
    return false;
  };
  const clamp = () => {
    if (heroState.journey.broken) return;
    const stop = scrollOf(P_STOP);
    if (stop !== null && lenis.scroll > stop + 1) lenis.scrollTo(stop, { immediate: true, force: true });
  };
  lenis.on("scroll", clamp);
  return () => {
    lenis.options.virtualScroll = previous;
    lenis.off("scroll", clamp);
  };
}

/**
 * Inside the tunnel, stopping lets the fall carry on: after a short pause
 * the page glides (via Lenis) on to the boulder — and, once it has burst, on
 * to the end of the tunnel. Any scroll input — wheel, touch, keys, scrollbar
 * — hands control straight back; stop again and it resumes. Off for reduced
 * motion.
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
      if (p <= P_AUTO_FROM) return;
      let to;
      if (p < P_STOP - 0.003) to = P_STOP; // on to the boulder
      else if (heroState.journey.broken && p < 0.996) to = 1; // it burst: on down the tube
      else return;
      const target = st.start + (st.end - st.start) * to;
      const screens = Math.abs(target - lenis.scroll) / window.innerHeight;
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

