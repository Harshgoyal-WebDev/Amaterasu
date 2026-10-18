import SmoothScroll from "@/components/SmoothScroll";
import McanzeeHero from "@/components/McanzeeHero/McanzeeHero";

export const metadata = {
  title: "MCanzee — Ideas into Worlds",
  description: "Creative digital studio crafting digital experiences that move brands forward.",
};

export default function McanzeePage() {
  return (
    <SmoothScroll>
      <main className="bg-[#eef1f6]">
        <McanzeeHero />

        {/* Placeholder for the 2D site the hero hands off to. */}
        <section id="vision" className="flex min-h-screen items-center px-5 font-sans md:px-[6vw]">
          <div className="max-w-3xl">
            <p className="mb-6 text-xs uppercase tracking-[0.3em] text-[#1f2bff]">02 — The Vision</p>
            <h2 className="text-4xl font-black uppercase leading-[0.95] tracking-[-0.03em] text-[#0b0d14] md:text-7xl">
              Next section goes here
            </h2>
          </div>
        </section>
      </main>
    </SmoothScroll>
  );
}
