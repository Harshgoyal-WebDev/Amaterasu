"use client";

import Image from "next/image";
import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import {useLenis} from "lenis/react"

gsap.registerPlugin(SplitText, DrawSVGPlugin);

const Loader = () => {
    const lenis = useLenis();
  const loaderRef = useRef(null);
  const circleRef = useRef(null);
  const svgRef = useRef(null);
  const textRef = useRef(null);
  const introTlRef = useRef(null);
  const exitTlRef = useRef(null);
  const splitRef = useRef(null);

  useEffect(() => {
    lenis&&lenis.stop();
    const ctx = gsap.context(() => {
      if (
        !loaderRef.current ||
        !circleRef.current ||
        !svgRef.current ||
        !textRef.current
      ) {
        return;
      }

      const circles = svgRef.current.querySelectorAll("circle");

      splitRef.current = new SplitText(textRef.current, {
        type: "lines",
        linesClass: "loader-line",
      });

      splitRef.current.lines.forEach((line) => {
        const mask = document.createElement("div");
        mask.className = "loader-line-mask";
        line.parentNode.insertBefore(mask, line);
        mask.appendChild(line);
      });

      gsap.set(loaderRef.current, {
        autoAlpha: 1,
        pointerEvents: "auto",
      });

      gsap.set(circleRef.current, {
        filter: "blur(0px)",
        opacity: 1,
      });

      gsap.set(circles, {
        drawSVG: "0% 0%",
      });

      gsap.set(svgRef.current, {
        rotate: -320,
        transformOrigin: "50% 50%",
      });

      gsap.set(splitRef.current.lines, {
        yPercent: 110,
      });

      introTlRef.current = gsap.timeline();

      introTlRef.current
        .to(
          circles,
          {
            delay: 0.4,
            drawSVG: "0% 100%",
            duration: 2.4,
            stagger: 0.02,
            ease: "power3.inOut",
          },
          0,
        )
        .to(
          svgRef.current,
          {
            rotate: 0,
            duration: 2.4,
            ease: "power3.inOut",
          },
          0,
        )
        .to(
          splitRef.current.lines,
          {
            yPercent: 0,
            duration: 0.9,
            stagger: 0.06,
            ease: "power3.out",
          },
          1.45,
        );
    }, loaderRef);

    return () => {
      introTlRef.current?.kill();
      exitTlRef.current?.kill();
      splitRef.current?.revert();
      ctx.revert();
    };
  }, [lenis]);

  const handleEnter = () => {
    if (!loaderRef.current || !circleRef.current || exitTlRef.current) return;
    lenis&&lenis.start();

    exitTlRef.current = gsap.timeline({
      onComplete: () => {
        gsap.set(loaderRef.current, {
          pointerEvents: "none",
        });
      },
    });

    exitTlRef.current
      .to(
        splitRef.current?.lines || [],
        {
          yPercent: -110,
          duration: 0.4,
          stagger: 0.04,
          ease: "power3.in",
        },
        0,
      )
      .to(
        circleRef.current,
        {
          scale: 0.72,
          opacity: 0,
          filter: "blur(18px)",
          duration: 0.7,
          ease: "power3.inOut",
        },
        0.05,
      )
      .to(
        loaderRef.current,
        {
          autoAlpha: 0,
          duration: 0.8,
          ease: "power3.inOut",
        },
        0.18,
      );
  };

  return (
    <>
      <div
        ref={loaderRef}
        className="loader fixed inset-0 z-[100] flex h-screen w-screen items-center justify-center"
      >
        <div className="absolute inset-0 h-full w-full">
          <Image
            className="h-full w-full object-cover"
            alt="bg-img"
            src="/assets/ametrasu-bg.png"
            width={1920}
            height={1080}
            priority
          />
        </div>

        <button
          ref={circleRef}
          type="button"
          onClick={handleEnter}
          className="click-enter-circle relative size-[17vw] cursor-pointer overflow-hidden rounded-full max-md:size-[34vw] max-sm:size-[44vw]"
        >
          <svg
            ref={svgRef}
            viewBox="0 0 197 197"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="circle-svg h-full w-full text-white"
          >
            <circle
              cx="98.5"
              cy="98.5"
              r="97.5"
              stroke="currentColor"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              transform="matrix(0,-1,1,0,0,197)"
            />
            <circle
              cx="98.5"
              cy="98.5"
              r="97.5"
              stroke="currentColor"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div className="pointer-events-none absolute left-1/2 top-1/2 w-[8vw] -translate-x-1/2 -translate-y-1/2 max-md:w-[18vw] max-sm:w-[26vw]">
            <div
              ref={textRef}
              className="text-center text-[0.75vw] leading-[1.05] text-white max-md:text-[2vw] max-sm:text-[3.2vw] font-mono"
            >
              Click To Enter
            </div>
          </div>
        </button>
       
      </div>

      <style jsx global>{`
        .loader-line-mask {
          display: block;
          overflow: hidden;
        }

        .loader-line {
          display: block;
          will-change: transform;
        }
      `}</style>
    </>
  );
};

export default Loader;
