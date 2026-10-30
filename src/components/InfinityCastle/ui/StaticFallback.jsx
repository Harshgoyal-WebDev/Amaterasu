"use client";

/**
 * No WebGL (or the 3D scene failed): the same journey, told with the
 * castle's own Blender renders as a scrolling sequence. Keeps the concept,
 * never a blank screen.
 */

const FRAMES = [
  ["cam_01_entrance_gateway", "門", "You have been summoned.", "A gate in the dark. Two lanterns. Nothing else."],
  ["cam_06_bridge_balcony", "奈落", "The floor opens.", "You fall past rooms that hang from nothing."],
  ["cam_03_corridor", "障子廊下", "A corridor of paper and cedar.", "It continues further than it should."],
  ["cam_02_interior_room", "座敷", "The room.", "And the same room again, almost."],
  ["cam_05_inverted_architecture", "逆さの間", "Up stops meaning anything.", "Stairs hang from ceilings; corridors run along walls."],
  ["cam_07_central_abyss", "深淵", "The central abyss.", "Towers of rooms in every direction."],
  ["cam_08_crossroads", "無限の辻", "Every way is open.", "None of them leads out."],
  ["cam_01_entrance_gateway", "門", "The gate, again.", "It was never outside the castle."],
];

export default function StaticFallback({ reason }) {
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto overscroll-contain bg-[#030202]" style={{ touchAction: "pan-y" }}>
      <p className="ic-serif sticky top-0 z-10 bg-gradient-to-b from-[#030202] to-transparent px-5 py-4 text-center text-[9px] uppercase tracking-[0.4em] text-[#f2e4cc]/40">
        {reason === "error" ? "The 3D castle could not open on this device" : "Your browser can't open the castle in 3D"} — a still version follows
      </p>
      {FRAMES.map(([img, jp, title, line], i) => (
        <section key={i} className="relative flex h-svh items-end overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/assets/infinity-castle/previews/${img}.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" loading={i < 2 ? "eager" : "lazy"} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#030202] via-[#030202]/30 to-[#030202]/60" />
          <div className="relative px-6 pb-[14vh] md:px-[8vw]">
            <span className="ic-jp block text-[22px] tracking-[0.2em] text-[#f2e4cc]/80">{jp}</span>
            <h2 className="ic-serif mt-3 text-[15px] uppercase tracking-[0.42em] text-[#f2e4cc]/90 md:text-[19px]">{title}</h2>
            <p className="ic-serif mt-3 max-w-md text-[13px] leading-relaxed tracking-[0.06em] text-[#f2e4cc]/55">{line}</p>
          </div>
        </section>
      ))}
    </div>
  );
}
