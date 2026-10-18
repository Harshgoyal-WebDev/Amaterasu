import SoundToggle from "./SoundToggle";

/**
 * Placeholder HTML layer for composition checks — real typography, outside
 * the canvas, responsive on its own. Replace freely when building the site.
 */
const NAV = ["Home", "Work", "Services", "About", "Contact"];

export default function HeroOverlay({ copyRef, cueRef }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-2 font-sans text-[#0b0d14]">
      <header className="pointer-events-auto flex items-center justify-between px-5 pt-5 md:px-[5.5vw] md:pt-9">
        <span className="text-xl font-black tracking-[0.08em] text-[#1f2bff] md:text-2xl">MCANZEE</span>
        <nav className="hidden gap-12 text-[11px] font-medium uppercase tracking-[0.14em] lg:flex">
          {NAV.map((item, i) => (
            <a key={item} href={`#${item.toLowerCase()}`} className="flex gap-3">
              <span className="opacity-40">0{i + 1}</span>
              {item}
            </a>
          ))}
        </nav>
        <a
          href="#contact"
          className="flex items-center gap-3 rounded-full border border-[#1f2bff]/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] md:px-7 md:py-4"
        >
          <span className="size-2 rounded-full bg-[#1f2bff]" />
          Let&apos;s build
        </a>
      </header>

      <div
        ref={copyRef}
        className="absolute left-5 top-[16%] md:left-[6vw] md:top-[22%]"
      >
        <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.3em] md:text-xs">
          Creative digital studio
        </p>
        <h1 className="text-[clamp(3.2rem,6.4vw,7.75rem)] font-black uppercase leading-[0.86] tracking-[-0.045em]">
          Ideas
          <br />
          Into
          <br />
          <span className="text-[#1f2bff]">Worlds</span>
        </h1>
        <p className="mt-8 border-l border-current/40 pl-6 text-[11px] uppercase leading-[1.9] tracking-[0.28em] opacity-80 md:mt-10 md:text-sm">
          Digital experiences
          <br />
          that move
          <br />
          brands forward.
        </p>
      </div>

      <div
        ref={cueRef}
        className="absolute bottom-6 left-5 flex items-center gap-5 text-[10px] uppercase tracking-[0.3em] text-white md:bottom-14 md:left-[5.5vw] md:text-[11px]"
      >
        <span className="grid size-12 place-items-center rounded-full border border-white/70 md:size-16">
          <span className="size-1.5 animate-pulse rounded-full bg-white" />
        </span>
        Scroll to explore
        <span className="hidden h-px w-44 bg-white/50 md:block" />
      </div>

      <div className="absolute bottom-6 right-5 flex flex-col items-end gap-4 md:bottom-14 md:right-[5.5vw]">
        <SoundToggle />
        <span className="hidden text-[11px] uppercase tracking-[0.3em] text-white/80 md:block">( 3D Experience )</span>
      </div>
    </div>
  );
}
