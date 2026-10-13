// Anonymous page-view counting is OFF unless NEXT_PUBLIC_ANALYTICS=true was set when the site was built.
// (NEXT_PUBLIC_* values are baked in at build time, so changing it means redeploying.)

// The default reads the variable by its full literal name on purpose: Next replaces `process.env.NEXT_PUBLIC_X` with its
// value while building, but cannot do that for `process.env[name]` or a bare `process.env` passed around.
export function analyticsEnabled(env: Record<string, string | undefined> = { NEXT_PUBLIC_ANALYTICS: process.env.NEXT_PUBLIC_ANALYTICS }): boolean {
  return env.NEXT_PUBLIC_ANALYTICS?.trim().toLowerCase() === "true";
}

/**
 * What analytics may know about a visit: the address without anything after "?" or "#".
 * A share link keeps the whole poem in its #hash, so the hash must never leave the browser.
 */
export function stripToPath(url: string): string {
  return url.split("#")[0].split("?")[0];
}

/** Passed to Vercel Analytics as `beforeSend`: every event, pageview or custom, goes out with a cleaned address. */
export function cleanEvent<T extends { url: string }>(event: T): T {
  return { ...event, url: stripToPath(event.url) };
}
