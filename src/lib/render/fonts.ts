// PURE: the one place that turns font settings into a CSS font string, so layout, rendering and font loading
// can never disagree about what "the poster font" is.
import type { MoodPreset } from "@/lib/moods/types";

export interface FontSpec {
  family: string;
  weight: number;
  italic: boolean;
  size: number;
}

/** A canvas-compatible CSS font shorthand, e.g. `italic 600 64px "Cormorant Garamond", serif`. */
export const fontString = ({ family, weight, italic, size }: FontSpec): string =>
  `${italic ? "italic " : ""}${weight} ${size}px ${family}`;

/** Footer type sizes in px at 1080 wide: a small tracked title over a slightly larger italic byline. */
export const FOOTER_TITLE_SIZE = 24;
export const FOOTER_BYLINE_SIZE = 28;

/** Every font the mood draws with: poem text, emphasis, and the footer's title and byline. Preloaded before measuring. */
export function moodFontSpecs(mood: MoodPreset): FontSpec[] {
  const { typography, emphasis, footer } = mood;
  return [
    { family: typography.display, weight: typography.weight, italic: typography.italic ?? false, size: 16 },
    { family: typography.display, weight: emphasis.weight, italic: emphasis.italic, size: 16 },
    { family: typography.display, weight: footer.weight, italic: false, size: 16 },
    { family: typography.display, weight: footer.bylineWeight, italic: true, size: 16 },
  ];
}
