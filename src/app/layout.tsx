import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Serif_Display, Fraunces, Inter, Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";

// Exposed as CSS variables. The canvas reads them at runtime (see lib/render/browser.ts), so the poster is
// drawn with exactly the fonts the page loaded. Presets refer to them as var(--font-cormorant) etc.
// Only the first two are preloaded; the rest download when a mood that uses them is chosen.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
  preload: false,
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "800"],
  preload: false,
});

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
  preload: false,
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Stanza",
  description: "Stanza never writes a word. It performs yours.",
};

const fontVariables = [cormorant, inter, spaceGrotesk, fraunces, dmSerif, spaceMono].map((f) => f.variable).join(" ");

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
