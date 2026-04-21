"use client";

import React, { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ReactLenis } from "lenis/react";
import ParallaxCard from "@/components/Ametrasu/ParallaxCard";
import StickyPointPlaneSection from "@/components/Ametrasu/StickyPointPlaneSection";
import ParticleFaceTunnel from "@/components/Ametrasu/ParticleFaceTunnel";
import ImageParticleBreakdown from "@/components/ImageParticleBreakdown/ImageParticleBreakdown";
import Loader from "@/components/Ametrasu/Loader";
import BottomGradient from "@/components/Ametrasu/BottomGradient";

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

export default function Page() {
  const sectionRef = useRef(null);

  const heroProgressRef = useRef(0);
  const tunnelProgressRef = useRef(0);

  const tunnelLayerRef = useRef(null);
  const gridLayerRef = useRef(null);
  const firstLayerRef = useRef(null);
  const secondLayerRef = useRef(null);

  const blobOpacityRef = useRef(1);
  const planeZoomRef = useRef(0);
  const planeOpacityRef = useRef(1);

  const autoScrollTweenRef = useRef(null);
  const interactionTimeoutRef = useRef(null);
  const isUserInteractingRef = useRef(false);
  const shouldResumeAutoScrollRef = useRef(false);
  const latestProgressRef = useRef(0);

  // -----------------------------
  // Adjustable trigger values
  // -----------------------------
  const BLOB_FADE_START = 0.0;
  const BLOB_FADE_END = 0.05;

  const PLANE_ZOOM_START = 0.08;
  const PLANE_ZOOM_END = 0.2;

  const PLANE_FADE_START = 0.2;
  const PLANE_FADE_END = 0.3;

  const SECOND_FADE_START = 0.05;
  const SECOND_FADE_END = 0.07;

  const TUNNEL_START = 0.28;
  const TUNNEL_END = 0.6;
  const TUNNEL_FADE_IN = 0.05;
  const TUNNEL_FADE_OUT_START = 0.65;
  const TUNNEL_FADE_OUT_WINDOW = 0.05;

  const GRID_FADE_START = 0.58;
  const GRID_FADE_WINDOW = 0.08;

  // -----------------------------
  // Tunnel auto-scroll controls
  // -----------------------------
  const ENABLE_TUNNEL_AUTOSCROLL = true;
  const TUNNEL_AUTOSCROLL_TRIGGER_START = 0.28;
  const TUNNEL_AUTOSCROLL_TRIGGER_END = 0.63;
  const TUNNEL_AUTOSCROLL_TARGET_PROGRESS = 0.63;
  const TUNNEL_AUTOSCROLL_DURATION = 20.2;
  const TUNNEL_AUTOSCROLL_EASE = "none";

  const USER_IDLE_RESUME_DELAY = 350;
  const AUTOSCROLL_PROGRESS_EPSILON = 0.002;

  const clearInteractionTimeout = () => {
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = null;
    }
  };

  const killAutoScroll = () => {
    if (autoScrollTweenRef.current) {
      autoScrollTweenRef.current.kill();
      autoScrollTweenRef.current = null;
    }
  };

  const getSectionScrollTarget = (progressValue) => {
    if (!sectionRef.current) return null;

    const section = sectionRef.current;
    const rect = section.getBoundingClientRect();
    const sectionTopAbs = window.scrollY + rect.top;
    const sectionScrollable = Math.max(
      section.offsetHeight - window.innerHeight,
      0,
    );

    return sectionTopAbs + sectionScrollable * progressValue;
  };

  const startAutoScroll = (
    targetProgress,
    duration = TUNNEL_AUTOSCROLL_DURATION,
  ) => {
    const targetY = getSectionScrollTarget(targetProgress);
    if (targetY == null) return;

    killAutoScroll();

    autoScrollTweenRef.current = gsap.to(window, {
      scrollTo: {
        y: targetY,
        autoKill: true,
      },
      duration,
      ease: TUNNEL_AUTOSCROLL_EASE,
      overwrite: true,
      onComplete: () => {
        autoScrollTweenRef.current = null;
        shouldResumeAutoScrollRef.current = false;
      },
      onInterrupt: () => {
        autoScrollTweenRef.current = null;
      },
    });
  };

  const handleUserInteraction = () => {
    isUserInteractingRef.current = true;

    if (autoScrollTweenRef.current) {
      shouldResumeAutoScrollRef.current = true;
      killAutoScroll();
    }

    clearInteractionTimeout();

    interactionTimeoutRef.current = setTimeout(() => {
      isUserInteractingRef.current = false;

      const p = latestProgressRef.current;
      const withinTunnelWindow =
        p >= TUNNEL_AUTOSCROLL_TRIGGER_START &&
        p <= TUNNEL_AUTOSCROLL_TRIGGER_END;

      const needsResume =
        p < TUNNEL_AUTOSCROLL_TARGET_PROGRESS - AUTOSCROLL_PROGRESS_EPSILON;

      if (
        ENABLE_TUNNEL_AUTOSCROLL &&
        shouldResumeAutoScrollRef.current &&
        withinTunnelWindow &&
        needsResume
      ) {
        startAutoScroll(TUNNEL_AUTOSCROLL_TARGET_PROGRESS, 6.5);
      } else {
        shouldResumeAutoScrollRef.current = false;
      }
    }, USER_IDLE_RESUME_DELAY);
  };

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set([tunnelLayerRef.current, gridLayerRef.current], {
        autoAlpha: 0,
      });

      gsap.set(secondLayerRef.current, {
        autoAlpha: 0,
        zIndex: 3,
      });

      gsap.set(firstLayerRef.current, {
        autoAlpha: 1,
        zIndex: 4,
      });

      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (self) => {
          const p = self.progress;
          latestProgressRef.current = p;

          const insideAutoScrollWindow =
            p >= TUNNEL_AUTOSCROLL_TRIGGER_START &&
            p <= TUNNEL_AUTOSCROLL_TRIGGER_END;

          const needsAutoScroll =
            p < TUNNEL_AUTOSCROLL_TARGET_PROGRESS - AUTOSCROLL_PROGRESS_EPSILON;

          if (
            ENABLE_TUNNEL_AUTOSCROLL &&
            insideAutoScrollWindow &&
            needsAutoScroll &&
            !autoScrollTweenRef.current &&
            !isUserInteractingRef.current
          ) {
            startAutoScroll(TUNNEL_AUTOSCROLL_TARGET_PROGRESS);
          }

          if (
            p < TUNNEL_AUTOSCROLL_TRIGGER_START - 0.02 ||
            p > TUNNEL_AUTOSCROLL_TARGET_PROGRESS + 0.02
          ) {
            shouldResumeAutoScrollRef.current = false;
          }

          heroProgressRef.current = p;

          const tunnelP = gsap.utils.clamp(
            0,
            1,
            (p - TUNNEL_START) / (TUNNEL_END - TUNNEL_START),
          );
          tunnelProgressRef.current = tunnelP;

          const tunnelOpacity = gsap.utils.clamp(
            0,
            1,
            (p - TUNNEL_START) / TUNNEL_FADE_IN,
          );

          const tunnelFadeOut = gsap.utils.clamp(
            0,
            1,
            (TUNNEL_FADE_OUT_START - p) / TUNNEL_FADE_OUT_WINDOW,
          );

          gsap.set(tunnelLayerRef.current, {
            autoAlpha: tunnelOpacity * tunnelFadeOut,
          });

          const gridOpacity = gsap.utils.clamp(
            0,
            1,
            (p - GRID_FADE_START) / GRID_FADE_WINDOW,
          );

          gsap.set(gridLayerRef.current, {
            autoAlpha: gridOpacity,
          });

          blobOpacityRef.current = gsap.utils.clamp(
            0,
            1,
            1 - (p - BLOB_FADE_START) / (BLOB_FADE_END - BLOB_FADE_START),
          );

          planeZoomRef.current = gsap.utils.clamp(
            0,
            1,
            (p - PLANE_ZOOM_START) / (PLANE_ZOOM_END - PLANE_ZOOM_START),
          );

          planeOpacityRef.current = gsap.utils.clamp(
            0,
            1,
            1 - (p - PLANE_FADE_START) / (PLANE_FADE_END - PLANE_FADE_START),
          );

          if (p < PLANE_FADE_START) planeOpacityRef.current = 1;
          if (p > PLANE_FADE_END) planeOpacityRef.current = 0;

          gsap.set(firstLayerRef.current, {
            autoAlpha: planeOpacityRef.current,
          });

          const secondOpacity = gsap.utils.clamp(
            0,
            1,
            (p - SECOND_FADE_START) / (SECOND_FADE_END - SECOND_FADE_START),
          );

          gsap.set(secondLayerRef.current, {
            autoAlpha: secondOpacity,
            zIndex: p >= SECOND_FADE_START ? 5 : 3,
          });
        },
      });

      ScrollTrigger.refresh();
    }, sectionRef);

    const onWheel = () => handleUserInteraction();
    const onTouchMove = () => handleUserInteraction();
    const onTouchStart = () => handleUserInteraction();
    const onKeyDown = (e) => {
      const keys = [
        "ArrowUp",
        "ArrowDown",
        "PageUp",
        "PageDown",
        "Home",
        "End",
        "Space",
      ];
      if (keys.includes(e.code) || keys.includes(e.key)) {
        handleUserInteraction();
      }
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      killAutoScroll();
      clearInteractionTimeout();

      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("keydown", onKeyDown);

      ctx.revert();
    };
  }, []);

  useEffect(() => {
    gsap.set(".gradient-1", { opacity: 0 });
    gsap.set(".gradient-2", { opacity: 0 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "15% top",
        end: "25% top",
        scrub: true,
      },
    });

    tl.fromTo(
      sectionRef.current,
      { background: "#ffffff" },
      { background: "#111B7F" },
    )
      .fromTo(".gradient-0", { opacity: 1 }, { opacity: 0 }, "<")
      .fromTo(".gradient-2", { opacity: 0 }, { opacity: 1 }, "<")
      .fromTo(".gradient-1", { opacity: 0 }, { opacity: 1 }, "<");

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, []);

  return (
    <ReactLenis root>
      <main className="bg-white">
        <section
          ref={sectionRef}
          className="relative h-[1800vh]"
          id="experience"
        >
          <div className="sticky top-0 h-screen overflow-hidden bg-gradient-to-b">
            <div className="gradient-0 pointer-events-none absolute inset-0 z-1">
              <div className="absolute bottom-0 left-0 h-screen w-screen bg-linear-to-b from-[#FFFFFF] to-[#BAE6F0]" />
            </div>

            <div className="gradient-1 pointer-events-none absolute inset-0 z-1">
              <div className="absolute bottom-0 left-0 h-[60vh] w-screen bg-linear-to-b from-[#0A1057]/0 to-[#0A1057]" />
            </div>

            <div className="gradient-2 pointer-events-none absolute inset-0 z-2">
              <div className="absolute bottom-0 left-0 h-[25vh] w-screen bg-linear-to-b from-[#2D5F92]/0 to-[#2D5F92]" />
            </div>

            <div
              ref={gridLayerRef}
              className="absolute inset-0 z-[7] pointer-events-none fourth"
            >
              <StickyPointPlaneSection
                sectionRef={sectionRef}
                trailSize={0.05}
                trailDensity={150}
                trailSpeedMin={300}
                trailSpeedMax={305}
                trailTailMin={120}
                trailTailMax={156}
                trailColor={[2.4, 2.4, 2.4]}
                startY={-4}
              />
            </div>

            <div ref={tunnelLayerRef} className="absolute inset-0 z-[6] third">
              <ParticleFaceTunnel
                progressRef={tunnelProgressRef}
                faceImageSrc="/assets/face-outline.png"
              />
            </div>

            <div
              ref={secondLayerRef}
              className="absolute inset-0 second"
              style={{ zIndex: 3 }}
            >
              <ImageParticleBreakdown
                imageSrc="/assets/ametrasu-img.png"
                progressRef={heroProgressRef}
                transitionColors={["#142ea8", "#a9e7ff", "#ffffff"]}
              />
            </div>

            <div
              ref={firstLayerRef}
              className="absolute inset-0 first"
              style={{ zIndex: 4 }}
            >
              <ParallaxCard
                colorMap="/textures/character.ktx2"
                depthMap="/textures/character_depth.ktx2"
                normalMap="/textures/character_normal.ktx2"
                scanMap="/textures/character_scan.ktx2"
                width={3.6}
                height={3.6}
                parallaxStrength={0.02}
                baseBloomIntensity={4.08}
                hoverBloomIntensity={2.78}
                hoverRadius={0.1}
                noiseStrength={0.25}
                particleSize={1.5}
                coreParticleSize={1.2}
                parallaxLayers={[0, 0.04, 0.09, 0.16]}
                blobOpacityRef={blobOpacityRef}
                planeZoomRef={planeZoomRef}
                planeOpacityRef={planeOpacityRef}
              />
            </div>
            <div className="absolute inset-0 z-[8] pointer-events-none">
              <BottomGradient />
            </div>
          </div>
        </section>
      </main>
      <Loader />
    </ReactLenis>
  );
}
