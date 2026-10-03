// PURE: how a word arrives. `p` is the eased progress, 0 (not there yet) to 1 (settled).
// Plain numbers in, numbers out, so the hot path allocates nothing.
import type { EntranceStyle } from "@/lib/moods/types";

/** How long every entrance animation takes. Words overlap: the next one starts before this one settles. */
export const ENTRANCE_MS = 600;

/** Phase 3b implements fade-rise only. The other styles fall back to it until Phase 4. */
export function entranceAlpha(_style: EntranceStyle, p: number): number {
  return p;
}

/** Vertical offset in px (positive = lower than the final position). */
export function entranceOffsetY(_style: EntranceStyle, p: number, fontSize: number): number {
  return (1 - p) * fontSize * 0.3;
}
