import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Serif_Display, Fraunces, Geist, Geist_Mono, Inter, Instrument_Serif, Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";

// APP fonts (the interface). Instrument Serif for headings and the poem/title inputs, Geist for UI text,
// Geist Mono for timecodes.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});
const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// POSTER fonts (what the canvas draws). Exposed as CSS variables; the canvas reads them at runtime
// (see lib/render/browser.ts), so the poster uses exactly the fonts the page loaded. Presets refer to them as
// var(--font-cormorant) etc. They download only when a mood that uses them is shown.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  preload: false,
});
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], preload: false });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], weight: ["500", "700"], preload: false });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["500", "800"], preload: false });
const dmSerif = DM_Serif_Display({ variable: "--font-dm-serif", subsets: ["latin"], weight: "400", preload: false });
const spaceMono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: ["400", "700"], preload: false });

export const metadata: Metadata = {
  title: "Stanza",
  description: "You wrote the poem. Stanza gives it a pulse. Stanza never writes a word. It performs yours.",
};

const fontVariables = [instrumentSerif, geist, geistMono, cormorant, inter, spaceGrotesk, fraunces, dmSerif, spaceMono]
  .map((f) => f.variable)
  .join(" ");

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
