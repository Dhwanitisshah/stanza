// Facts about the site that more than one file needs. Nothing here can depend on a poem: this is what a crawler,
// a link preview or a search result may show, and a share link's poem lives in the #hash, which servers never receive.

export const SITE_NAME = "Stanza";
export const SITE_TAGLINE = "Your poem, performed";
export const SITE_DESCRIPTION =
  "Stanza turns a poem you wrote into an animated typographic poster and an Instagram-ready reel. It never writes a word. It performs yours.";
export const REPO_URL = "https://github.com/Dhwanitisshah/stanza";

/**
 * The public address, for canonical URLs and the share image. NEXT_PUBLIC_SITE_URL wins (set it when you add a custom
 * domain); on Vercel the production domain is provided automatically; locally it is localhost.
 */
export function siteUrl(
  // Literal names, so Next can inline the public one at build time (see lib/analytics.ts).
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  },
): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

/** The paper colour of the app, used for the browser's theme-color and the web manifest. */
export const PAPER = "#F4EFE6";
export const INK = "#1C1A17";
