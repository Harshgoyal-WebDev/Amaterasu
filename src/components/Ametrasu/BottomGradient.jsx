"use client";

import React, { use, useEffect, useRef } from "react";
import gsap from "gsap";

const BottomGradient = ({ scaleRef }) => {
  const wrapRef = useRef(null);
  const blueRef = useRef(null);
  const whiteRef = useRef(null);

  useEffect(() => {
    gsap.set([blueRef.current, whiteRef.current], {
      scale: 0,
      transformOrigin: "50% 50%",
    });
  }, []);
  useEffect(() => {
    gsap.to(blueRef.current, {
      scale: 20,
      transformOrigin: "50% 50%",
      ease: "none",
      scrollTrigger: {
        trigger: "#experience",
        start: "91% bottom",
        end: "95% bottom",
        scrub: true,
        // markers: true,
      },
    });
    gsap.to(whiteRef.current, {
      scale: 20,
      transformOrigin: "50% 50%",
      ease: "none",
      scrollTrigger: {
        trigger: "#experience",
        start: "91% bottom",
        end: "95% bottom",
        scrub: true,
      },
    });
  }, []);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div ref={wrapRef} className="sticky top-0 h-screen w-screen">
        <div
          ref={blueRef}
          className="bg-[#9FCEEC] size-[18vw] rounded-full blur-lg absolute bottom-[-18%] left-1/2 -translate-x-1/2"
        />

        <div
          ref={whiteRef}
          className="bg-white size-[12vw] rounded-full blur-lg absolute bottom-[-12%] left-1/2 -translate-x-1/2"
        />
      </div>
    </div>
  );
};

export default BottomGradient;
