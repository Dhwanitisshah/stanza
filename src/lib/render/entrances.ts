// PURE: how a word arrives. Each style maps progress (0 = not there yet, 1 = at rest) to a visual state.
// Progress is the EASED progress, so an overshooting easing curve can push it a little past 1 and back;
// every style stays well defined there. At exactly 1 every style is the identity: full opacity, no offset,
// scale 1, no blur, every character visible.
import type { EntranceStyle } from "@/lib/moods/types";

export interface EntranceState {
  opacity: number; // 0..1
  dx: number; // px, positive = right
  dy: number; // px, positive = down
  scale: number; // 1 = normal size
  blur: number; // px of softness (drawn with shadowBlur, never ctx.filter)
  visibleChars: number; // characters shown so far (typewriter); the full count for every other style
}

/** How long each entrance takes. Words overlap: the next one starts before this one has settled. */
export const ENTRANCE_MS: Record<EntranceStyle, number> = {
  "fade-rise": 600,
  drift: 1000,
  slam: 380,
  "ink-bleed": 800,
  typewriter: 380,
};

export const newEntranceState = (): EntranceState => ({ opacity: 0, dx: 0, dy: 0, scale: 1, blur: 0, visibleChars: 0 });

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Largest blur an ink-bleed word starts with, as a fraction of the font size. */
export const INK_BLEED_BLUR_EM = 0.14;

/**
 * Fills `out` (reused, so the per-frame loop allocates nothing) and returns it.
 * @param charCount number of characters in the piece being drawn (only typewriter cares)
 */
export function entranceState(
  style: EntranceStyle,
  progress: number,
  fontSize: number,
  charCount: number,
  out: EntranceState = newEntranceState(),
): EntranceState {
  out.dx = 0;
  out.dy = 0;
  out.scale = 1;
  out.blur = 0;
  out.visibleChars = charCount;

  switch (style) {
    case "fade-rise": // rises into place while fading in
      out.opacity = clamp01(progress);
      out.dy = (1 - progress) * fontSize * 0.3;
      break;
    case "drift": // fades in while settling downward from slightly above
      out.opacity = clamp01(progress);
      out.dy = (progress - 1) * fontSize * 0.16 + 0;
      break;
    case "slam": // big and sudden, then settles to size
      out.opacity = clamp01(progress * 4);
      out.scale = 1 + (1 - progress) * 0.3;
      break;
    case "ink-bleed": // soft to sharp
      out.opacity = clamp01(progress * 1.6);
      out.blur = Math.max(0, 1 - progress) * fontSize * INK_BLEED_BLUR_EM;
      break;
    case "typewriter": // one character at a time
      out.visibleChars = progress >= 1 ? charCount : Math.floor(clamp01(progress) * charCount);
      out.opacity = out.visibleChars > 0 ? 1 : 0;
      break;
  }
  return out;
}
