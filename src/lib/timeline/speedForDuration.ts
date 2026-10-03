// PURE: the length control. Given a target duration, find the playback speed that lands on it.
// The lead-in, the page transitions and the final hold are FIXED times that speed cannot change, so only the
// rest of the poem (words and pauses) is stretched or squeezed.
//
// Speed never leaves the readable range (about 0.5x to 2.5x):
//   - a target LONGER than the slowest readable pace keeps that pace and holds the finished poster longer;
//   - a target SHORTER than the fastest readable pace is unreachable: the result says so and reports the
//     shortest readable duration, instead of rushing the poem.
import type { Analysis } from "@/lib/ai/schema";
import type { MoodPreset } from "@/lib/moods/types";
import type { PublicProsody } from "@/lib/prosody";
import { buildTimeline, type TimelineOptions } from "./buildTimeline";
import { TIMING } from "./config";

export type LengthMode =
  | "auto" // no target: speed 1
  | "speed" // the target was reached by changing the speed
  | "hold" // slowest readable speed, and the final poster holds longer to reach the target
  | "too-short"; // the target is below the shortest readable duration

export interface LengthSolution {
  mode: LengthMode;
  speed: number;
  /** Extra time the finished poster holds (only in "hold" mode). */
  extraHoldMs: number;
  /** The duration this solution actually produces. */
  totalMs: number;
  /** The requested duration, or null for Auto. */
  targetMs: number | null;
  /** Shortest readable duration (fastest readable speed). Targets below this are unavailable. */
  minMs: number;
  /** false when the target is below minMs. */
  reachable: boolean;
}

/** What the timeline depends on besides speed: page transitions, a title, echoes. */
export interface LengthContext extends TimelineOptions {
  pageOfLine?: number[];
}

const SEARCH_STEPS = 48;

/**
 * @param targetMs wanted duration in ms, or null for Auto (speed 1)
 */
export function speedForDuration(
  prosody: PublicProsody,
  analysis: Pick<Analysis, "emphasis">,
  mood: MoodPreset,
  targetMs: number | null,
  context: LengthContext = {},
): LengthSolution {
  const { pageOfLine = [], ...options } = context;
  const totalAt = (speed: number, extraHoldMs = 0) =>
    buildTimeline(prosody, analysis, mood, speed, pageOfLine, { ...options, extraHoldMs }).totalMs;

  const slowest: number = TIMING.readableMinSpeed;
  const fastest: number = TIMING.readableMaxSpeed;
  const minMs = totalAt(fastest);

  if (targetMs === null || !Number.isFinite(targetMs)) {
    return { mode: "auto", speed: 1, extraHoldMs: 0, totalMs: totalAt(1), targetMs: null, minMs, reachable: true };
  }
  const target = Math.round(targetMs);

  if (target < minMs) {
    return { mode: "too-short", speed: fastest, extraHoldMs: 0, totalMs: minMs, targetMs: target, minMs, reachable: false };
  }

  const slowestTotal = totalAt(slowest);
  if (target >= slowestTotal) {
    const extraHoldMs = target - slowestTotal;
    return { mode: "hold", speed: slowest, extraHoldMs, totalMs: totalAt(slowest, extraHoldMs), targetMs: target, minMs, reachable: true };
  }

  // Total time falls as speed rises, so bisect. Keep the best candidate: per-word rounding can make the
  // curve step by a few milliseconds, which is far inside the +-100 ms we promise.
  let low = slowest;
  let high = fastest;
  let best = { speed: slowest, total: slowestTotal };
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const speed = (low + high) / 2;
    const total = totalAt(speed);
    if (Math.abs(total - target) < Math.abs(best.total - target)) best = { speed, total };
    if (total > target) low = speed;
    else high = speed;
  }
  return { mode: "speed", speed: best.speed, extraHoldMs: 0, totalMs: best.total, targetMs: target, minMs, reachable: true };
}
