"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ReactLenis, useLenis } from "lenis/react";
import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger);

// Tells ScrollTrigger about every Lenis scroll step.
function ScrollTriggerBridge() {
  useLenis(ScrollTrigger.update);
  return null;
}

/**
 * One smooth-scroll system for the page: Lenis, driven by GSAP's ticker so
 * Lenis and every ScrollTrigger update in the same frame.
 */
export default function SmoothScroll({ children, options }) {
  const lenisRef = useRef(null);

  useEffect(() => {
    const update = (time) => lenisRef.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    return () => gsap.ticker.remove(update);
  }, []);

  return (
    <ReactLenis root ref={lenisRef} options={{ autoRaf: false, ...options }}>
      <ScrollTriggerBridge />
      {children}
    </ReactLenis>
  );
}
