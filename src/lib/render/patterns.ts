// PURE: the eight background patterns. Each one is drawn with plain 2D path calls from nothing but
// (size, strength, colour), so it is deterministic: the same inputs make the same drawing, every time.
// The editor draws a pattern ONCE per scene into an offscreen canvas (like the paper grain) and stamps it per frame.

export const PATTERN_IDS = ["none", "ruled", "notebook", "grid", "dots", "hatch", "frame", "arch"] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

export const PATTERN_LABELS: Record<PatternId, string> = {
  none: "None",
  ruled: "Ruled",
  notebook: "Notebook",
  grid: "Grid",
  dots: "Dots",
  hatch: "Hatch",
  frame: "Frame",
  arch: "Arch",
};

/** The slice of the 2D canvas API the patterns use. Real canvases and test recorders both satisfy it. */
export type PatternContext = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "beginPath" | "closePath" | "moveTo" | "lineTo" | "arc" | "rect" | "clip" | "stroke" | "fill" | "lineWidth" | "strokeStyle" | "fillStyle" | "globalAlpha" | "lineCap"
>;

/** Strength 0..100 maps to how visible the lines are. At 100 they are clearly there but never drown the text. */
export const MAX_PATTERN_ALPHA = 0.4;
export const clampStrength = (strength: number) => (Number.isFinite(strength) ? Math.min(100, Math.max(0, strength)) : 0);
export const patternAlpha = (strength: number) => (clampStrength(strength) / 100) * MAX_PATTERN_ALPHA;

// Spacings and widths in px at 1080 wide.
const RULE_SPACING = 64;
const RULE_FIRST = 128;
const MARGIN_X = 150;
const GRID_SPACING = 54;
const DOT_SPACING = 54;
const DOT_RADIUS = 3.2;
const HATCH_SPACING = 40;
const FRAME_INSET = 56;
const FRAME_INNER_GAP = 16;
const ARCH_SIDE = 0.14; // fraction of the width left empty on each side
const ARCH_TOP = 0.08; // fraction of the height
const ARCH_BOTTOM = 0.92;

function horizontalLines(ctx: PatternContext, width: number, height: number) {
  ctx.beginPath();
  for (let y = RULE_FIRST; y < height - RULE_SPACING / 2; y += RULE_SPACING) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

function drawArch(ctx: PatternContext, width: number, height: number) {
  const left = width * ARCH_SIDE;
  const right = width * (1 - ARCH_SIDE);
  const radius = (right - left) / 2;
  const top = height * ARCH_TOP;
  const bottom = height * ARCH_BOTTOM;
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(left, top + radius);
  ctx.arc((left + right) / 2, top + radius, radius, Math.PI, 0);
  ctx.lineTo(right, bottom);
  ctx.stroke();
}

/**
 * Draws one pattern onto a transparent canvas of `width` x `height`.
 * @param strength 0..100; 0 draws nothing
 * @param colour the ink colour: patterns are drawn in the poster's own ink, faintly
 */
export function drawPattern(ctx: PatternContext, id: PatternId, width: number, height: number, strength: number, colour: string): void {
  const alpha = patternAlpha(strength);
  if (id === "none" || alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineCap = "butt";

  switch (id) {
    case "ruled":
      ctx.lineWidth = 2;
      horizontalLines(ctx, width, height);
      break;
    case "notebook":
      ctx.lineWidth = 2;
      horizontalLines(ctx, width, height);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, 0);
      ctx.lineTo(MARGIN_X, height);
      ctx.stroke();
      break;
    case "grid":
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = GRID_SPACING; x < width; x += GRID_SPACING) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = GRID_SPACING; y < height; y += GRID_SPACING) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
      break;
    case "dots":
      ctx.beginPath();
      for (let y = DOT_SPACING / 2; y + DOT_RADIUS <= height; y += DOT_SPACING) {
        for (let x = DOT_SPACING / 2; x + DOT_RADIUS <= width; x += DOT_SPACING) {
          ctx.moveTo(x + DOT_RADIUS, y);
          ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      break;
    case "hatch":
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.clip();
      ctx.beginPath();
      for (let x = -height; x < width; x += HATCH_SPACING) {
        ctx.moveTo(x, height);
        ctx.lineTo(x + height, 0);
      }
      ctx.stroke();
      break;
    case "frame":
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.rect(FRAME_INSET, FRAME_INSET, width - 2 * FRAME_INSET, height - 2 * FRAME_INSET);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(FRAME_INSET + FRAME_INNER_GAP, FRAME_INSET + FRAME_INNER_GAP, width - 2 * (FRAME_INSET + FRAME_INNER_GAP), height - 2 * (FRAME_INSET + FRAME_INNER_GAP));
      ctx.stroke();
      break;
    case "arch":
      ctx.lineWidth = 3;
      drawArch(ctx, width, height);
      break;
  }
  ctx.restore();
}
