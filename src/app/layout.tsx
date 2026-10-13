import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Cormorant_Garamond, DM_Serif_Display, Fraunces, Geist, Geist_Mono, Inter, Instrument_Serif, Space_Grotesk, Space_Mono } from "next/font/google";
import { AnalyticsGate } from "@/components/AnalyticsGate";
import { analyticsEnabled } from "@/lib/analytics";
import { PAPER, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, siteUrl } from "@/lib/site";
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
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["500", "800"], style: ["normal", "italic"], preload: false });
const dmSerif = DM_Serif_Display({ variable: "--font-dm-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"], preload: false });
const spaceMono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], preload: false });

// Metadata is the same for every visitor and never contains a poem. A share link keeps its poem in the #hash, which
// browsers do not send to the server, so a link preview can only ever show this generic card.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${SITE_NAME}: ${SITE_TAGLINE.toLowerCase()}`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME}: ${SITE_TAGLINE.toLowerCase()}`,
    description: SITE_DESCRIPTION,
    url: "/",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "A Stanza poster: four lines of a poem about a lamp, a kettle and the rain, set in serif type on warm paper." }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME}: ${SITE_TAGLINE.toLowerCase()}`,
    description: SITE_DESCRIPTION,
    images: ["/og.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: PAPER,
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

const fontVariables = [instrumentSerif, geist, geistMono, cormorant, inter, spaceGrotesk, fraunces, dmSerif, spaceMono]
  .map((f) => f.variable)
  .join(" ");

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The Content-Security-Policy carries a fresh nonce on every request (src/proxy.ts), and Next can only put that nonce
  // on the page's inline scripts if the page is rendered for each request. This line opts every page in.
  await connection();

  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        {analyticsEnabled() && <AnalyticsGate />}
      </body>
    </html>
  );
}
