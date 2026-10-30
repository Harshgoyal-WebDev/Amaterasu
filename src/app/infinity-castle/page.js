import { Cormorant_Garamond, Shippori_Mincho } from "next/font/google";
import InfinityCastle from "@/components/InfinityCastle/InfinityCastle";

const serif = Cormorant_Garamond({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-ic-serif",
  display: "swap",
});

const mincho = Shippori_Mincho({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-ic-jp",
  display: "swap",
  preload: false,
});

export const metadata = {
  title: "Infinity Castle",
  description: "You have been summoned. An endless, scroll-driven journey through an impossible Japanese castle.",
};

export const viewport = {
  themeColor: "#030202",
  viewportFit: "cover",
};

export default function InfinityCastlePage() {
  return (
    <main className={`${serif.variable} ${mincho.variable}`}>
      <InfinityCastle />
    </main>
  );
}
