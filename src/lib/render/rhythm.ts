// PURE: the maths behind the rhythm strip, a bar per word drawn from the timeline.
// Bar position and width come from the timeline (so gaps are the poem's rests), height from the word's stress,
// and a bar for an emphasised word is accented (and wide, because the emphasis hold is part of its duration).
import type { Scene } from "./types";

export type StressLevel = "stressed" | "secondary" | "unstressed";

export interface RhythmBar {
  wordId: string;
  /** When the word lands, in ms: this is where a click on the bar seeks to. */
  start: number;
  duration: number;
  /** Left edge and width as fractions (0..1) of the whole timeline. */
  x: number;
  width: number;
  level: StressLevel;
  /** 0..1, tallest for stressed words. */
  height: number;
  emphasis: boolean;
}

export const BAR_HEIGHT: Record<StressLevel, number> = { stressed: 1, secondary: 0.7, unstressed: 0.4 };

/** A word is as strong as its strongest syllable: "102" (daffodils) counts as stressed. */
export function stressLevel(stress: string): StressLevel {
  if (stress.includes("1")) return "stressed";
  if (stress.includes("2")) return "secondary";
  return "unstressed";
}

export function rhythmBars(scene: Scene): RhythmBar[] {
  const { timeline, prosody } = scene;
  const stressOf = new Map<string, string>();
  for (const stanza of prosody.stanzas) for (const line of stanza.lines) for (const word of line.words) stressOf.set(word.id, word.stress);

  const total = Math.max(1, timeline.totalMs);
  const bars: RhythmBar[] = [];
  for (const event of timeline.events) {
    if (event.type !== "appear") continue;
    const level = stressLevel(stressOf.get(event.wordId) ?? "");
    bars.push({
      wordId: event.wordId,
      start: event.start,
      duration: event.duration,
      x: event.start / total,
      width: event.duration / total,
      level,
      height: BAR_HEIGHT[level],
      emphasis: event.isEmphasis,
    });
  }
  return bars; // the timeline is sorted, so bars are in time order
}

/** Index of the word that has most recently landed at time t, or -1 before the first word. */
export function barIndexAtTime(bars: readonly RhythmBar[], t: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Where a click at `fraction` of the strip's width should seek to: the landing of the bar under the pointer,
 * or of the nearest bar if the pointer is in a gap. Null if there are no bars.
 */
export function seekTimeForFraction(bars: readonly RhythmBar[], fraction: number): number | null {
  if (bars.length === 0) return null;
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));

  // A bar that contains the pointer wins (bars that touch share an edge: the later one owns it).
  // (EPSILON absorbs float rounding: start/total + duration/total can differ from next.start/total by 1e-16.)
  const under = bars.find((bar) => f >= bar.x - EPSILON && f < bar.x + bar.width - EPSILON);
  if (under) return under.start;

  // In a gap (or past the last bar): the nearest bar.
  let best = bars[0];
  let bestDistance = Infinity;
  for (const bar of bars) {
    const distance = f < bar.x ? bar.x - f : f - (bar.x + bar.width);
    if (distance < bestDistance) {
      best = bar;
      bestDistance = distance;
    }
  }
  return best.start;
}

const EPSILON = 1e-9;

/** A word-step must move at least this far, so a tiny rounding gap can't make an arrow key do nothing. */
const STEP_EPSILON_MS = 1;

/** The landing time one word forward (+1) or back (-1) from t, or the nearest end if there is nowhere to go. */
export function stepWord(bars: readonly RhythmBar[], t: number, direction: 1 | -1): number | null {
  if (bars.length === 0) return null;
  if (direction === 1) {
    const next = bars.find((bar) => bar.start > t + STEP_EPSILON_MS);
    return (next ?? bars[bars.length - 1]).start;
  }
  for (let i = bars.length - 1; i >= 0; i--) if (bars[i].start < t - STEP_EPSILON_MS) return bars[i].start;
  return bars[0].start;
}

/** First and last word landings, for Home and End. */
export const edgeTime = (bars: readonly RhythmBar[], edge: "start" | "end"): number | null =>
  bars.length === 0 ? null : edge === "start" ? bars[0].start : bars[bars.length - 1].start;
