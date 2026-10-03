// Browser-only glue: everything here needs `document` or a canvas. The pure engine never imports this file.
import type { MoodPreset } from "@/lib/moods/types";
import { buildFrameIndex } from "./frameIndex";
import { fontString, moodFontSpecs } from "./fonts";
import type { FrameResources } from "./renderFrame";
import { coverCanvas, type ImageAsset } from "./image";
import { drawPattern } from "./patterns";
import { grainPixels, hashSeed } from "./texture";
import type { MeasureText, Scene } from "./types";

const FONT_LOAD_TIMEOUT_MS = 8000;
const CANVAS_DEFAULT_FONT = "10px sans-serif";

/**
 * Replaces var(--font-x) with the real font-family list the page loaded (next/font gives each font a
 * generated name, so the canvas can only learn it from the computed style).
 */
export function resolveCssVars(value: string, element: Element = document.body): string {
  const styles = getComputedStyle(element);
  return value
    .replace(/var\((--[\w-]+)\)\s*,?\s*/g, (_match, name: string) => {
      const resolved = styles.getPropertyValue(name).trim();
      return resolved ? `${resolved}, ` : "";
    })
    .replace(/,\s*$/, "");
}

export function resolveMoodFonts(mood: MoodPreset): MoodPreset {
  const { typography } = mood;
  return {
    ...mood,
    typography: { ...typography, display: resolveCssVars(typography.display), body: resolveCssVars(typography.body) },
  };
}

const firstFamily = (cssFamilyList: string) => cssFamilyList.split(",")[0].trim();

/**
 * Waits until every font and weight the mood draws with is actually loaded. Throws if one is missing or slow:
 * measuring with a fallback font would give a layout that is wrong for the real font.
 * `text` is passed so the right unicode-range subsets load too.
 */
export async function loadMoodFonts(mood: MoodPreset, text: string): Promise<void> {
  const sample = `Aa ${text}`;

  const loadAll = Promise.all(
    moodFontSpecs(mood).map(async (spec) => {
      const family = firstFamily(spec.family);
      const faces = await document.fonts.load(fontString({ ...spec, family }), sample);
      if (faces.length === 0) throw new Error(`The font ${family} (${spec.italic ? "italic " : ""}weight ${spec.weight}) is not available.`);
    }),
  );
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("The fonts took too long to load. Check your connection and try again.")), FONT_LOAD_TIMEOUT_MS);
  });
  await Promise.race([loadAll, timeout]);
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Measures text on an offscreen canvas with the exact CSS font string the poster will be drawn with. */
export function createCanvasMeasure(): MeasureText {
  const context = createCanvas(1, 1).getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error("This browser can't measure text on a canvas.");
  return (text, font) => {
    context.font = font;
    // A rejected font string leaves the default in place; measuring with it would be silently wrong.
    if (context.font === CANVAS_DEFAULT_FONT && font !== CANVAS_DEFAULT_FONT) throw new Error(`Invalid font: ${font}`);
    return context.measureText(text).width;
  };
}

/** Paper grain, rendered once per scene. Same scene, same seed, same grain. */
export function createGrainCanvas(width: number, height: number, intensity: number, seed: number): CanvasImageSource | null {
  if (intensity <= 0) return null;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) return null;
  const pixels = grainPixels(width, height, intensity, seed) as Uint8ClampedArray<ArrayBuffer>;
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas;
}

/** The pattern (ruled, grid...) drawn once onto a transparent canvas, in the poster's own ink. */
export function createPatternCanvas(scene: Scene, width: number, height: number, ink: string): CanvasImageSource | null {
  const { id, strength } = scene.styling.pattern;
  if (id === "none" || strength <= 0) return null;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) return null;
  drawPattern(context, id, width, height, strength, ink);
  return canvas;
}

/**
 * Everything renderFrame wants per scene, built once: the frame index, the paper grain, the pattern, and the
 * photo cover-fitted to the canvas. renderFrame itself stays a pure function of (scene, t, these).
 */
export function prepareResources(scene: Scene, image: ImageAsset | null = null): Required<FrameResources> {
  const index = buildFrameIndex(scene);
  const seed = hashSeed(`${scene.mood.id}:${scene.format}:${scene.analysis.paletteVariant}`);
  return {
    index,
    grain: createGrainCanvas(index.width, index.height, index.textureIntensity, seed),
    pattern: createPatternCanvas(scene, index.width, index.height, index.ink),
    image: scene.styling.background.kind === "image" && image ? coverCanvas(image, index.width, index.height) : null,
  };
}
