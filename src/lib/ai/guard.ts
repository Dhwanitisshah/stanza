import "server-only";

// Two cost guards that sit in front of Gemini. Both end in the deterministic fallback, never in an error:
// a visitor still gets a poster, the bill just stops growing.
//   AI_ENABLED=false   the kill switch: nobody's poem is sent to Gemini.
//   GEMINI_DAILY_CAP   at most this many Gemini calls per server instance per UTC day (default 500).
// The cap is in memory, so on Vercel each warm instance counts for itself. It bounds the damage of a burst; the real
// ceiling on spend is a budget alert on the Google AI Studio / Cloud project (see the README).

export const DEFAULT_DAILY_CAP = 500;

/** False only when AI_ENABLED is set to false, 0, off or no. Unset means on. */
export function aiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.AI_ENABLED?.trim().toLowerCase();
  return !(value === "false" || value === "0" || value === "off" || value === "no");
}

/** The cap from GEMINI_DAILY_CAP. A missing or unreadable value means the default, never "unlimited". 0 is allowed: no calls. */
export function dailyCapFromEnv(env: Record<string, string | undefined> = process.env): number {
  const raw = env.GEMINI_DAILY_CAP?.trim();
  if (!raw || !/^\d{1,9}$/.test(raw)) return DEFAULT_DAILY_CAP;
  return Number(raw);
}

export interface DailyCap {
  /** Counts one Gemini call. Returns false (and counts nothing) once today's cap is used up. */
  take(): boolean;
  /** Calls counted so far today. */
  used(): number;
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** `limit` is a function so the env is read when a call is made, not frozen when the module loads. */
export function createDailyCap(limit: () => number = () => dailyCapFromEnv(), now: () => number = Date.now): DailyCap {
  let day = utcDay(now());
  let count = 0;

  const rollOver = () => {
    const today = utcDay(now());
    if (today !== day) {
      day = today;
      count = 0;
    }
  };

  return {
    take() {
      rollOver();
      if (count >= limit()) return false;
      count++;
      return true;
    },
    used() {
      rollOver();
      return count;
    },
  };
}
