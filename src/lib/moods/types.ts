import type { MoodId } from "./ids";

/** CSS cubic-bezier control points: [x1, y1, x2, y2]. y values above 1 overshoot, then settle. */
export type CubicBezier = [number, number, number, number];

export type EntranceStyle = "fade-rise" | "typewriter" | "ink-bleed" | "slam" | "drift";

/** How a rhyme echo is drawn: recolour the word, underline both partners, or make the word glow. */
export type EchoStyle = "pulse" | "underline" | "glow";

export type ColorRole = "ink" | "accent" | "accent2";

export interface Palette {
  background: string;
  ink: string;
  accent: string;
  accent2?: string;
}

/** How an emphasised word is drawn once it lands. */
export interface EmphasisTreatment {
  scale: number; // 1 = same size
  color: ColorRole;
  weight: number; // CSS font-weight
  italic: boolean;
  /** An underline that draws itself, in the emphasis colour. */
  underline: boolean;
  /** A highlighter bar behind the word, in the accent colour (the text stays `color`). */
  highlight: boolean;
}

export interface EchoTreatment {
  style: EchoStyle;
  color: "accent" | "accent2";
}

export interface Typography {
  /** CSS font-family lists. Poem text uses `display`; `body` is for captions. */
  display: string;
  body: string;
  weight: number;
  /** The whole poem is set in italic (and a title above it follows). */
  italic?: boolean;
  /** Row height as a multiple of the font size. */
  lineHeight: number;
  align: "left" | "center";
}

/**
 * The quiet footer of the final frame, the same in every mood: a letter-spaced UPPERCASE title over an italic
 * byline, both in the mood's own typeface. Only the weights and the tracking vary.
 */
export interface FooterStyle {
  /** Weight of the title. */
  weight: number;
  /** Weight of the (italic) byline. */
  bylineWeight: number;
  /** Letter-spacing of the title, in em. */
  trackingEm: number;
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
  echo: EchoTreatment;
  footer: FooterStyle;
  /** Paper grain strength, 0 (none) to 1 (heavy). */
  textureIntensity: number;
  /** Milliseconds per syllable at speed 1. */
  beatMs: number;
  /** Smallest poem font size in px (at 1080 wide) before lines wrap or pages split. Default 44. */
  minFontSize?: number;
}
