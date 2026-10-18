import SmoothScroll from "@/components/SmoothScroll";
import PortalHero from "@/components/PortalHero/PortalHero";

export const metadata = {
  title: "My Portfolio",
  description: "Creative frontend developer portfolio.",
};

export default function MyPortfolioPage() {
  return (
    <SmoothScroll>
      <main className="bg-[#040508]">
        <PortalHero />
      </main>
    </SmoothScroll>
  );
}
