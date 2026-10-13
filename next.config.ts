import type { NextConfig } from "next";

// Headers that are the same on every response. The Content-Security-Policy is NOT here: it carries a fresh nonce per
// request, so it is built in src/proxy.ts (from src/lib/security/csp.ts).
export const securityHeaders = [
  // Browsers must not guess a file's type from its content ("sniffing"): a text file can never be run as a script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Links we send people to learn which site they came from, but not the path or the #share-link hash.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Stanza never needs the camera, the microphone or the location. Saying so switches them off for the page and anything in it.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Old browsers ignore CSP frame-ancestors; this is the same rule for them.
  { key: "X-Frame-Options", value: "DENY" },
  // After the first visit, use https only for two years. (Ignored over plain http, so localhost is unaffected.)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
