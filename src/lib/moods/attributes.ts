// PURE: the attributes a viewer uses to tell moods apart. A test requires every pair of presets to differ in several.
import { isDarkBackground } from "./contrast";
import type { MoodPreset } from "./types";

export const DISTINCTNESS_ATTRIBUTES = [
  "font",
  "background",
  "alignment",
  "entrance",
  "easing",
  "tempo",
  "emphasis",
  "echo",
] as const;

export type DistinctnessAttribute = (typeof DISTINCTNESS_ATTRIBUTES)[number];

/** Slow, medium or fast: beats within a bucket feel alike. */
export function tempoBucket(beatMs: number): "fast" | "medium" | "slow" {
  if (beatMs <= 200) return "fast";
  if (beatMs <= 250) return "medium";
  return "slow";
}

/** The emphasis treatment as a label: what you see, not the numbers behind it. */
export function emphasisKind(mood: MoodPreset): string {
  const { emphasis } = mood;
  const parts: string[] = [];
  if (emphasis.italic) parts.push("italic");
  if (emphasis.underline) parts.push("underline");
  if (emphasis.highlight) parts.push("highlight");
  if (emphasis.scale >= 1.1) parts.push("scale");
  if (emphasis.weight >= 700) parts.push("bold");
  parts.push(emphasis.color);
  return parts.join("+");
}

const firstFamily = (css: string) => css.replace(/var\([^)]*\)\s*,?\s*/g, "").split(",")[0].replace(/["']/g, "").trim();

/** One comparable value per attribute. */
export function moodAttributes(mood: MoodPreset): Record<DistinctnessAttribute, string> {
  return {
    font: firstFamily(mood.typography.display),
    background: isDarkBackground(mood.palettes[0].background) ? "dark" : "light",
    alignment: mood.typography.align,
    entrance: mood.entrance,
    easing: mood.easing.join(","),
    tempo: tempoBucket(mood.beatMs),
    emphasis: emphasisKind(mood),
    echo: mood.echo.style,
  };
}

export function differingAttributes(a: MoodPreset, b: MoodPreset): DistinctnessAttribute[] {
  const [x, y] = [moodAttributes(a), moodAttributes(b)];
  return DISTINCTNESS_ATTRIBUTES.filter((attribute) => x[attribute] !== y[attribute]);
}
