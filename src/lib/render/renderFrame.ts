// renderFrame(ctx, scene, t) draws the poster at time t. It is a PURE function of (scene, t):
//   - no Date.now, no Math.random, nothing remembered between calls;
//   - preview, scrubber, PNG export and video export all call it, so what you see is exactly what you export.
// The index and the grain image are inputs (built once per scene by the caller), not hidden caches.
//
// Soft ink (ink-bleed) and glow use shadowBlur, never ctx.filter: filter support on canvas is patchy (Safari).
import { entranceState, INK_BLEED_BLUR_EM, newEntranceState, type EntranceState } from "./entrances";
import { buildFrameIndex, FOOTER_ALPHA, RESTORE_MS, type FrameIndex, type WordSpan } from "./frameIndex";
import type { Piece, Scene } from "./types";

/** The slice of the 2D canvas API renderFrame uses. Real contexts and test recorders both satisfy it. */
export type FrameContext = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "translate"
  | "scale"
  | "fillRect"
  | "fillText"
  | "drawImage"
  | "fillStyle"
  | "font"
  | "globalAlpha"
  | "textAlign"
  | "textBaseline"
  | "shadowBlur"
  | "shadowColor"
  | "shadowOffsetX"
>;

export interface FrameResources {
  /** From buildFrameIndex(scene). Built on the fly if missing (fine for tests, wasteful per frame). */
  index?: FrameIndex;
  /** The user's photo, already cover-fitted to the canvas size. Decoded once by the caller: renderFrame stays pure. */
  image?: CanvasImageSource | null;
  /** Pre-rendered paper grain, same size as the canvas. */
  grain?: CanvasImageSource | null;
  /** Pre-rendered background pattern (ruled, grid...), same size as the canvas, transparent. */
  pattern?: CanvasImageSource | null;
}

export function clampTime(t: number, totalMs: number): number {
  if (!Number.isFinite(t)) return 0;
  return t < 0 ? 0 : t > totalMs ? totalMs : t;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Geometry of the extras, in em of the (emphasised) font size.
const UNDERLINE_OFFSET_EM = 0.14;
const UNDERLINE_THICKNESS_EM = 0.05;
const HIGHLIGHT_TOP_EM = 0.85; // bar top, above the baseline
const HIGHLIGHT_HEIGHT_EM = 1.05;
const HIGHLIGHT_PAD_EM = 0.12;
const GLOW_BLUR_EM = 0.5;
const SCALE_PIVOT_EM = 0.3; // scale around a point this far above the baseline
/** Pushes a glyph off the canvas so that only its blurred shadow lands on screen (the "blur without filter" trick). */
const SHADOW_OFFSET = 3000;

/**
 * Scratch space for the entrance of the piece being drawn. It is completely overwritten before every read,
 * so nothing carries from one frame (or one call) to the next; it only saves an allocation per piece.
 */
const entrance: EntranceState = newEntranceState();

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

function resetShadow(ctx: FrameContext) {
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowColor = "rgba(0,0,0,0)";
}

/** Draws one piece of text for an entrance state: plain, scaled around its middle, or soft (ink-bleed). */
function drawText(ctx: FrameContext, index: FrameIndex, text: string, x: number, baselineY: number, width: number, fontPx: number, alpha: number, fill: string) {
  ctx.fillStyle = fill;

  if (entrance.blur > 0) {
    // Soft to sharp: a blurred ghost (only its shadow is on screen) fades into the sharp glyph.
    const softness = Math.min(1, entrance.blur / (index.fontSize * INK_BLEED_BLUR_EM));
    if (softness < 1) {
      ctx.globalAlpha = alpha * (1 - softness);
      ctx.fillText(text, x, baselineY);
    }
    ctx.globalAlpha = alpha * softness;
    ctx.shadowColor = fill;
    ctx.shadowBlur = entrance.blur;
    ctx.shadowOffsetX = SHADOW_OFFSET;
    ctx.fillText(text, x - SHADOW_OFFSET, baselineY);
    resetShadow(ctx);
    return;
  }

  ctx.globalAlpha = alpha;
  if (entrance.scale !== 1) {
    const pivotY = baselineY - fontPx * SCALE_PIVOT_EM;
    ctx.save();
    ctx.translate(x + width / 2, pivotY);
    ctx.scale(entrance.scale, entrance.scale);
    ctx.fillText(text, -width / 2, baselineY - pivotY);
    ctx.restore();
    return;
  }
  ctx.fillText(text, x, baselineY);
}

/** An underline that draws itself left to right as the word lands. */
function drawEmphasisUnderline(ctx: FrameContext, index: FrameIndex, piece: Piece, x: number, baselineY: number, fontPx: number, alpha: number, progress: number) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = index.emphasisFill;
  ctx.fillRect(x, baselineY + fontPx * UNDERLINE_OFFSET_EM, piece.width * clamp01(progress), fontPx * UNDERLINE_THICKNESS_EM);
}

function drawHighlightBar(ctx: FrameContext, index: FrameIndex, piece: Piece, x: number, baselineY: number, fontPx: number, alpha: number, progress: number) {
  const pad = fontPx * HIGHLIGHT_PAD_EM;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = index.highlightFill;
  ctx.fillRect(x - pad, baselineY - fontPx * HIGHLIGHT_TOP_EM, (piece.width + 2 * pad) * clamp01(progress), fontPx * HIGHLIGHT_HEIGHT_EM);
}

function drawEchoes(ctx: FrameContext, index: FrameIndex, word: WordSpan, time: number, wordAlpha: number, fontPx: number) {
  for (let e = 0; e < word.echoStarts.length; e++) {
    const pulse = (time - word.echoStarts[e]) / word.echoDurations[e];
    if (pulse <= 0 || pulse >= 1) continue;
    const amount = Math.sin(Math.PI * pulse) * word.echoWeights[e];
    ctx.fillStyle = index.echoFill;

    if (index.echoStyle === "underline") {
      // A line under BOTH rhyme partners, so the eye links them.
      ctx.globalAlpha = wordAlpha * amount;
      underline(ctx, index, word, fontPx);
      underline(ctx, index, word.echoPartners[e], fontPx);
      continue;
    }

    ctx.globalAlpha = wordAlpha * amount;
    if (index.echoStyle === "glow") {
      ctx.shadowColor = index.echoFill;
      ctx.shadowBlur = index.fontSize * GLOW_BLUR_EM * amount;
    }
    for (let p = 0; p < word.pieces.length; p++) {
      const piece = word.pieces[p];
      ctx.fillText(piece.text, piece.x, piece.y + index.baseline);
    }
    if (index.echoStyle === "glow") resetShadow(ctx);
  }
}

function underline(ctx: FrameContext, index: FrameIndex, word: WordSpan, fontPx: number) {
  const size = word.emphasized ? fontPx : index.fontSize;
  for (let p = 0; p < word.pieces.length; p++) {
    const piece = word.pieces[p];
    ctx.fillRect(piece.x, piece.y + index.baseline + size * UNDERLINE_OFFSET_EM, piece.width, size * UNDERLINE_THICKNESS_EM);
  }
}

export function renderFrame(ctx: FrameContext, scene: Scene, t: number, resources: FrameResources = {}): void {
  const index = resources.index ?? buildFrameIndex(scene);
  const time = clampTime(t, index.totalMs);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = index.background;
  ctx.fillRect(0, 0, index.width, index.height);
  // Back to front: background colour, photo, darkening, paper grain, pattern. Then the text.
  if (resources.image) {
    ctx.drawImage(resources.image, 0, 0);
    if (index.darken > 0) {
      ctx.globalAlpha = index.darken;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, index.width, index.height);
      ctx.globalAlpha = 1;
    }
  }
  if (resources.grain) ctx.drawImage(resources.grain, 0, 0);
  if (resources.pattern) ctx.drawImage(resources.pattern, 0, 0);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  resetShadow(ctx);
  let currentFont = "";

  // The title above the poem fades in first, and leaves with page 0.
  if (index.title) {
    const alpha = clamp01((time - index.titleStart) / index.titleDuration) * pageAlpha(index, 0, time);
    if (alpha > 0) {
      ctx.font = index.title.font;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = index.ink;
      ctx.fillText(index.title.text, index.title.x, index.title.y);
    }
  }

  const words = index.words;
  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    if (time < word.appearStart) continue;
    const onPage = pageAlpha(index, word.page, time);
    if (onPage <= 0) continue;

    const progress = index.ease(clamp01((time - word.appearStart) / index.entranceMs));
    const wordAlpha = dimFactor(index, word.stanza, time) * onPage;
    if (wordAlpha <= 0) continue;

    const emphasized = word.emphasized;
    const font = emphasized ? index.emphasisFont : index.font;
    if (font !== currentFont) {
      ctx.font = font;
      currentFont = font;
    }
    const fontPx = emphasized ? index.fontSize * index.emphasisScale : index.fontSize;
    const fill = word.fill;

    for (let p = 0; p < word.pieces.length; p++) {
      const piece = word.pieces[p];
      entranceState(word.entrance, progress, index.fontSize, word.charCounts[p], entrance);
      const alpha = wordAlpha * entrance.opacity;
      if (alpha <= 0) continue;

      const x = piece.x + entrance.dx;
      const baselineY = piece.y + index.baseline + entrance.dy;
      const text =
        word.prefixes && entrance.visibleChars < word.charCounts[p] ? word.prefixes[p][entrance.visibleChars] : piece.text;

      if (emphasized && index.highlight) drawHighlightBar(ctx, index, piece, x, baselineY, fontPx, alpha, progress);
      drawText(ctx, index, text, x, baselineY, piece.width, fontPx, alpha, fill);
      if (emphasized && index.underline) drawEmphasisUnderline(ctx, index, piece, x, baselineY, fontPx, alpha, progress);
    }

    drawEchoes(ctx, index, word, time, wordAlpha, fontPx);
  }

  // Title and byline fade in during the final hold.
  if (index.footer.length > 0 && time >= index.footerStart) {
    ctx.globalAlpha = clamp01((time - index.footerStart) / index.footerDuration) * FOOTER_ALPHA;
    ctx.fillStyle = index.ink;
    for (let i = 0; i < index.footer.length; i++) {
      const line = index.footer[i];
      ctx.font = line.font;
      const glyphs = line.glyphs;
      if (glyphs) for (let g = 0; g < glyphs.length; g++) ctx.fillText(glyphs[g].text, glyphs[g].x, line.y);
      else ctx.fillText(line.text, line.x, line.y);
    }
  }
  ctx.restore();
}
