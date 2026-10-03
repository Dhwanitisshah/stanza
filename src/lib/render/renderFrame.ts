// renderFrame(ctx, scene, t) draws the poster at time t. It is a PURE function of (scene, t):
//   - no Date.now, no Math.random, nothing remembered between calls;
//   - preview, scrubber, PNG export and video export all call it, so what you see is exactly what you export.
// The index and the grain image are inputs (built once per scene by the caller), not hidden caches.
import { ENTRANCE_MS, entranceAlpha, entranceOffsetY } from "./entrances";
import { buildFrameIndex, RESTORE_MS, type FrameIndex } from "./frameIndex";
import type { Scene } from "./types";

/** The slice of the 2D canvas API renderFrame uses. Real contexts and test recorders both satisfy it. */
export type FrameContext = Pick<CanvasRenderingContext2D, "save" | "restore" | "fillRect" | "fillText" | "drawImage"> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  globalAlpha: number;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
};

export interface FrameResources {
  /** From buildFrameIndex(scene). Built on the fly if missing (fine for tests, wasteful per frame). */
  index?: FrameIndex;
  /** Pre-rendered paper grain, same size as the canvas. */
  grain?: CanvasImageSource | null;
}

export function clampTime(t: number, totalMs: number): number {
  if (!Number.isFinite(t)) return 0;
  return t < 0 ? 0 : t > totalMs ? totalMs : t;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const UNDERLINE_OFFSET_EM = 0.14;
const UNDERLINE_THICKNESS_EM = 0.05;

/** 1 while the page is shown; fades in when its page event starts and out when the next page's starts. */
function pageAlpha(index: FrameIndex, page: number, t: number): number {
  let alpha = 1;
  if (page > 0) {
    const start = index.pageStart[page];
    alpha = start === undefined ? 1 : clamp01((t - start) / index.pageDuration[page]);
  }
  if (page + 1 < index.pageCount) {
    const next = index.pageStart[page + 1];
    if (next !== undefined) alpha *= 1 - clamp01((t - next) / index.pageDuration[page + 1]);
  }
  return alpha;
}

/** 1 normally; dimmed after the stanza ends; back to 1 as the finished poem is revealed. */
function dimFactor(index: FrameIndex, stanza: number, t: number): number {
  const start = index.dimStart[stanza];
  if (start === undefined) return 1;
  const restore = clamp01((t - index.restoreStart) / RESTORE_MS);
  if (restore >= 1) return 1;
  const dimmed = 1 - (1 - index.dimTo[stanza]) * clamp01((t - start) / index.dimDuration[stanza]);
  return dimmed + (1 - dimmed) * restore;
}

export function renderFrame(ctx: FrameContext, scene: Scene, t: number, resources: FrameResources = {}): void {
  const index = resources.index ?? buildFrameIndex(scene);
  const time = clampTime(t, index.totalMs);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = index.background;
  ctx.fillRect(0, 0, index.width, index.height);
  if (resources.grain) ctx.drawImage(resources.grain, 0, 0);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let currentFont = "";

  const words = index.words;
  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    if (time < word.appearStart) continue;
    const onPage = pageAlpha(index, word.page, time);
    if (onPage <= 0) continue;

    const progress = index.ease(clamp01((time - word.appearStart) / ENTRANCE_MS));
    const alpha = entranceAlpha(word.entrance, progress) * dimFactor(index, word.stanza, time) * onPage;
    if (alpha <= 0) continue;
    const offsetY = entranceOffsetY(word.entrance, progress, index.fontSize);

    const font = word.emphasized ? index.emphasisFont : index.font;
    if (font !== currentFont) {
      ctx.font = font;
      currentFont = font;
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = word.emphasized ? index.emphasisFill : index.ink;
    for (let p = 0; p < word.pieces.length; p++) {
      const piece = word.pieces[p];
      ctx.fillText(piece.text, piece.x, piece.y + index.baseline + offsetY);
      if (word.emphasized && index.underline) {
        const y = piece.y + index.baseline + offsetY + index.fontSize * UNDERLINE_OFFSET_EM;
        ctx.fillRect(piece.x, y, piece.width * progress, index.fontSize * UNDERLINE_THICKNESS_EM);
      }
    }

    // Rhyme echo: the word is redrawn in the accent colour, fading in and out.
    for (let e = 0; e < word.echoStarts.length; e++) {
      const pulse = (time - word.echoStarts[e]) / word.echoDurations[e];
      if (pulse <= 0 || pulse >= 1) continue;
      ctx.globalAlpha = alpha * Math.sin(Math.PI * pulse) * word.echoWeights[e];
      ctx.fillStyle = index.echoFill;
      for (let p = 0; p < word.pieces.length; p++) {
        const piece = word.pieces[p];
        ctx.fillText(piece.text, piece.x, piece.y + index.baseline + offsetY);
      }
    }
  }
  ctx.restore();
}
