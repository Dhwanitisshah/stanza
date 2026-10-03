// PURE: everything the user can change about how the poster LOOKS, and how it turns into actual colours.
// A scene carries a SceneStyling; the frame index resolves it to one palette; nothing here touches a canvas.
import { contrastRatio, luminance } from "@/lib/moods/contrast";
import type { MoodPreset, Palette } from "@/lib/moods/types";
import type { PatternId } from "./patterns";

export type { PatternId };

/** The two text colours chosen automatically on a custom colour or photo. */
export const DARK_INK = "#1C1A17";
export const LIGHT_INK = "#F6F1E7";

/** What sits behind the poem. An image's pixels live in the browser, not in the scene; the scene only knows how bright it is. */
export type BackgroundStyle =
  | { kind: "mood" }
  | { kind: "colour"; colour: string }
  /** `luminance` is the photo's average brightness (0..1), `darken` the black overlay (0..0.8). */
  | { kind: "image"; darken: number; luminance: number };

export interface SceneStyling {
  background: BackgroundStyle;
  pattern: { id: PatternId; strength: number };
  /** Colour overrides by global line index. */
  lineColours: Record<number, string>;
  /** Colour for the emphasised words; null = the mood's own. */
  emphasisColour: string | null;
}

export const DEFAULT_STYLING: SceneStyling = {
  background: { kind: "mood" },
  pattern: { id: "none", strength: 50 },
  lineColours: {},
  emphasisColour: null,
};

export const MAX_DARKEN = 0.8;
export const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** A palette with every colour decided, plus where the background really comes from. */
export interface ResolvedPalette extends Palette {
  /** True when a photo is behind the text: `background` is then only an average-grey stand-in. */
  onImage: boolean;
}

/** Linear luminance (0..1) to a grey #RRGGBB, for contrast maths against a photo. */
export function greyHex(lum: number): string {
  const l = clamp01(lum);
  const v = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055;
  const byte = Math.round(clamp01(v) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${byte}${byte}${byte}`.toUpperCase();
}

/** Dark or light ink, whichever reads better on a background of this luminance. */
export function autoInk(backgroundLuminance: number): string {
  const lum = clamp01(backgroundLuminance);
  const onDark = (lum + 0.05) / (luminance(DARK_INK) + 0.05);
  const onLight = (luminance(LIGHT_INK) + 0.05) / (lum + 0.05);
  return onDark >= onLight ? DARK_INK : LIGHT_INK;
}

/** Average relative luminance of RGBA pixels (e.g. a 24x24 sample of a photo). */
export function averageLuminance(rgba: ArrayLike<number>): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    sum += 0.2126 * channel(rgba[i]) + 0.7152 * channel(rgba[i + 1]) + 0.0722 * channel(rgba[i + 2]);
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

/** The brightness the text actually sits on: the photo, dimmed by the black overlay. */
export const effectiveImageLuminance = (imageLuminance: number, darken: number) => clamp01(imageLuminance) * (1 - Math.min(MAX_DARKEN, clamp01(darken)));

/** The first colour that is readable (3:1) on `background`, preferring the wanted one; falls back to ink. */
function readable(wanted: string | undefined, fallbacks: string[], background: string, ink: string): string {
  for (const candidate of [wanted, ...fallbacks, ink]) {
    if (candidate && contrastRatio(candidate, background) >= 3) return candidate;
  }
  return ink;
}

/** Turns a mood + palette variant + the user's background choice into the colours the poster is drawn with. */
export function resolvePalette(mood: MoodPreset, variant: number, styling: SceneStyling = DEFAULT_STYLING): ResolvedPalette {
  const base = mood.palettes[Math.min(2, Math.max(0, Math.trunc(variant) || 0))];
  const { background } = styling;
  if (background.kind === "mood") return { ...base, onImage: false };

  const onImage = background.kind === "image";
  const bg = background.kind === "colour" ? background.colour : greyHex(effectiveImageLuminance(background.luminance, background.darken));
  const ink = autoInk(luminance(bg));

  // A highlighter's accent is a bar behind dark ink, so it never needs contrast with the paper.
  const accent = mood.emphasis.highlight ? base.accent : readable(base.accent, [base.accent2 ?? base.accent], bg, ink);
  const accent2 = readable(base.accent2, [base.accent], bg, ink);
  return { background: bg, ink, accent, accent2, onImage };
}

/** The colour emphasised words have when the user has not chosen one: the mood's, or its highlighter bar. */
export function defaultEmphasisColour(mood: MoodPreset, palette: Palette): string {
  return mood.emphasis.highlight ? palette.accent : (palette[mood.emphasis.color] ?? palette.accent);
}

/** True if a line colour would be hard to read on this background. Not asked of photos, which vary across the frame. */
export function isHardToRead(colour: string, palette: ResolvedPalette): boolean {
  if (palette.onImage) return false;
  return contrastRatio(colour, palette.background) < 3;
}

/** Six calm backgrounds to start from, each readable with the automatic ink (7:1 or better). */
export const COLOUR_SWATCHES: { name: string; colour: string }[] = [
  { name: "Cream", colour: "#F5EFE2" },
  { name: "Sand", colour: "#E9D3BD" },
  { name: "Sage", colour: "#C9D3C3" },
  { name: "Slate", colour: "#2E3A4A" },
  { name: "Ink", colour: "#16171A" },
  { name: "Plum", colour: "#3A2A3F" },
];

export const isHexColour = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
