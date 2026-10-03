import type { MoodId } from "./ids";

/** CSS cubic-bezier control points: [x1, y1, x2, y2]. */
export type CubicBezier = [number, number, number, number];

export type EntranceStyle = "fade-rise" | "typewriter" | "ink-bleed" | "slam" | "drift";

export interface Palette {
  background: string;
  ink: string;
  accent: string;
  accent2?: string;
}

/** How an emphasised word is drawn once it lands. */
export interface EmphasisTreatment {
  scale: number; // 1 = same size
  color: "ink" | "accent" | "accent2";
  weight: number; // CSS font-weight
  underline: boolean; // animated underline draw
}

export interface Typography {
  /** CSS font-family lists. Poem text uses `display`; `body` is for small captions. */
  display: string;
  body: string;
  weight: number;
  /** Row height as a multiple of the font size. */
  lineHeight: number;
  align: "left" | "center";
}

export interface MoodPreset {
  id: MoodId;
  label: string;
  /** One palette per `paletteVariant` (0, 1, 2) the analysis can pick. */
  palettes: [Palette, Palette, Palette];
  typography: Typography;
  easing: CubicBezier;
  entrance: EntranceStyle;
  emphasis: EmphasisTreatment;
  /** Paper grain strength, 0 (none) to 1 (heavy). */
  textureIntensity: number;
  /** Milliseconds per syllable at speed 1. */
  beatMs: number;
}
