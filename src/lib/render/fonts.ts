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

export const FOOTER_FONT_SIZE = 30;

/** Every font the mood draws with: poem text, emphasis, and the footer. Used to preload before measuring. */
export function moodFontSpecs(mood: MoodPreset): FontSpec[] {
  const { typography, emphasis, footer } = mood;
  return [
    { family: typography.display, weight: typography.weight, italic: false, size: 16 },
    { family: typography.display, weight: emphasis.weight, italic: emphasis.italic, size: 16 },
    { family: footer.font === "display" ? typography.display : typography.body, weight: footer.weight, italic: footer.italic, size: 16 },
  ];
}
