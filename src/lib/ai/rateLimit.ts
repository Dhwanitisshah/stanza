import "server-only";

// In-memory sliding window per key (IP). State lives in one server instance only:
// on Vercel every serverless instance has its own counter, so this is a politeness limit, not a security one.

export interface RateLimiter {
  /** Records a hit; returns false if the key is over its limit. */
  allow(key: string): boolean;
}

const MAX_TRACKED_KEYS = 5000;

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    allow(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((time) => t - time < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);

      if (hits.size > MAX_TRACKED_KEYS) {
        // Drop keys whose newest hit is outside the window, so the map can't grow forever.
        for (const [k, times] of hits) if (t - times[times.length - 1] >= windowMs) hits.delete(k);
      }
      return true;
    },
  };
}

/** Best-effort client IP. On Vercel x-forwarded-for is set by the platform. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
