// PURE: decides where every word sits in the FINAL poster. The last frame of the animation is this layout.
// `measureText` is injected so tests (and the CLI) run without a browser; the app passes a canvas-backed one.
import type { MoodPreset } from "@/lib/moods/types";
import type { PublicProsody } from "@/lib/prosody";
import { FOOTER_BYLINE_SIZE, FOOTER_TITLE_SIZE, fontString } from "./fonts";
import type { FooterLine, FormatId, Layout, LayoutPage, MeasureText, Piece, PlacedWord, Rect, TitlePlacement } from "./types";

export const FORMATS: Record<FormatId, { width: number; height: number }> = {
  reel: { width: 1080, height: 1920 }, // 9:16
  post: { width: 1080, height: 1350 }, // 4:5
};

export const LAYOUT_CONFIG = {
  /**
   * Keep text out of the areas Instagram covers with its own UI (reels: caption and buttons at the
   * bottom, profile bar at the top). Sides are the same for both formats.
   */
  margins: {
    reel: { top: 220, bottom: 340, side: 96 },
    post: { top: 120, bottom: 120, side: 96 },
  },
  /** The default minimum; a mood can set its own (MoodPreset.minFontSize). ~44px on a 1080-wide poster is about 16pt on a phone screen: the smallest comfortable size. */
  minFontSize: 44,
  maxFontSize: 110,
  /** Only for pathological input (e.g. one 2,000-character line): shrink past the minimum rather than overflow. */
  absoluteMinFontSize: 12,
  /** Wrapped rows are indented by this many em (left-aligned moods only). */
  hangingIndentEm: 1,
  /**
   * Bottom strip kept free of poem text for the footer. A Reel keeps the footer INSIDE the Instagram-safe
   * area (its own UI covers the bottom 340px), so the poem makes room for it. A Post has no such UI, so the
   * footer sits lower, in the bottom margin, and the poem keeps the whole safe area.
   */
  footerReserve: { reel: 120, post: 0 },
  /** Where the last footer baseline sits: above the bottom of the safe area (Reel), or above the canvas edge (Post). */
  footerBaselineInset: { reel: 12, post: 56 },
  /** Distance between the title and byline baselines. */
  footerLineGap: 42,
  /** The footer shrinks to fit a long title, but never below this fraction of its size. */
  footerMinScale: 0.7,
  /** Where the baseline sits in an em box (most fonts: ascent is about 80% of the font size). */
  ascentRatio: 0.8,
  /** A title above the poem is drawn this much larger than the poem, and sits one em above the first stanza. */
  titleScale: 1.2,
  titleGapEm: 1,
  /** A long title shrinks to at most this fraction of its size, then is cut with an ellipsis. */
  titleMinScale: 0.6,
  /** Extra space between stanzas, in em. */
  stanzaGapEm: 0.8,
} as const;

// ---------- internals ----------

interface RowItem {
  wordId: string;
  text: string;
  width: number;
  emphasized: boolean;
}
interface WordInput {
  id: string;
  text: string;
  emphasized: boolean;
}
type Row = RowItem[];
interface LineRows {
  lineIndex: number;
  stanzaIndex: number;
  rows: Row[];
}
interface Block {
  lines: LineRows[];
  height: number;
}
interface Metrics {
  size: number;
  font: string;
  emphasisFont: string;
  rowHeight: number;
  gap: number;
  indent: number;
  space: number;
  availFirst: number;
  availNext: number;
  /** The title drawn above the poem (page 0 only), already fitted to one row; null if there is none. */
  title: { text: string; font: string; fontSize: number; width: number } | null;
  /** Vertical space the title takes at the top of page 0 (its row plus the gap below it). */
  titleHeight: number;
}

function safeAreaFor(format: FormatId): Rect {
  const { width, height } = FORMATS[format];
  const m = LAYOUT_CONFIG.margins[format];
  return { x: m.side, y: m.top, width: width - 2 * m.side, height: height - m.top - m.bottom };
}

/** Wraps `measureText` with a cache: the size search asks about the same words many times. */
function cachedMeasure(measureText: MeasureText): MeasureText {
  const cache = new Map<string, number>();
  return (text, font) => {
    const key = `${font}\u0000${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      width = measureText(text, font);
      cache.set(key, width);
    }
    return width;
  };
}

function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/** Cuts a word that is wider than a row into row-sized chunks (last resort, only at the minimum size). */
function splitToFit(text: string, availFirst: number, availRest: number, font: string, measure: MeasureText): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const g of graphemes(text)) {
    const avail = chunks.length === 0 ? availFirst : availRest;
    if (current && measure(current + g, font) > avail) {
      chunks.push(current);
      current = "";
    }
    current += g;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Greedy line wrapping. Returns the rows and whether every word fit a row without being split. */
function wrapLine(
  words: WordInput[],
  m: Metrics,
  measure: MeasureText,
  allowSplit: boolean,
): { rows: Row[]; wordsFit: boolean } {
  const rows: Row[] = [[]];
  let used = 0; // width used in the current row
  let wordsFit = true;
  const avail = () => (rows.length === 1 ? m.availFirst : m.availNext);
  const newRow = () => {
    rows.push([]);
    used = 0;
  };

  for (const word of words) {
    // Emphasised words are measured in their own (bolder, larger) font so they can never overflow.
    const font = word.emphasized ? m.emphasisFont : m.font;
    const width = measure(word.text, font);
    const current = rows[rows.length - 1];
    const item = (text: string, itemWidth: number): RowItem => ({ wordId: word.id, text, width: itemWidth, emphasized: word.emphasized });
    const needed = current.length ? used + m.space + width : width;

    if (needed <= avail()) {
      used = needed;
      current.push(item(word.text, width));
      continue;
    }
    if (current.length) newRow();
    if (width <= avail()) {
      rows[rows.length - 1].push(item(word.text, width));
      used = width;
      continue;
    }

    wordsFit = false;
    if (!allowSplit) {
      rows[rows.length - 1].push(item(word.text, width));
      used = width;
      continue;
    }
    const chunks = splitToFit(word.text, avail(), m.availNext, font, measure);
    chunks.forEach((chunk, i) => {
      if (i > 0) newRow();
      const chunkWidth = measure(chunk, font);
      rows[rows.length - 1].push(item(chunk, chunkWidth));
      used = chunkWidth;
    });
  }
  return { rows, wordsFit };
}

function metricsFor(size: number, mood: MoodPreset, safe: Rect, measure: MeasureText, titleText: string | null): Metrics {
  const family = mood.typography.display;
  const font = fontString({ family, weight: mood.typography.weight, italic: mood.typography.italic ?? false, size });
  const emphasisFont = fontString({ family, weight: mood.emphasis.weight, italic: mood.emphasis.italic, size: size * mood.emphasis.scale });
  const indent = mood.typography.align === "left" ? LAYOUT_CONFIG.hangingIndentEm * size : 0;
  return {
    size,
    font,
    emphasisFont,
    rowHeight: size * mood.typography.lineHeight,
    gap: LAYOUT_CONFIG.stanzaGapEm * size,
    indent,
    space: measure(" ", font),
    availFirst: safe.width,
    availNext: safe.width - indent,
    ...titleMetrics(titleText, size, mood, safe.width, measure),
  };
}

/** The title is set in the poem's typeface, a little larger, and shrunk (then cut) to fit one row. */
function titleMetrics(text: string | null, size: number, mood: MoodPreset, maxWidth: number, measure: MeasureText) {
  if (!text) return { title: null, titleHeight: 0 };
  const spec = { family: mood.typography.display, weight: mood.typography.weight, italic: mood.typography.italic ?? false };
  const fitted = fitText(text, spec, size * LAYOUT_CONFIG.titleScale, size * LAYOUT_CONFIG.titleMinScale, maxWidth, measure);
  const fontSize = Number(/(\d+(?:\.\d+)?)px/.exec(fitted.font)?.[1] ?? size);
  return {
    title: { text: fitted.text, font: fitted.font, fontSize, width: measure(fitted.text, fitted.font) },
    titleHeight: fontSize * mood.typography.lineHeight + size * LAYOUT_CONFIG.titleGapEm,
  };
}

function wrapAll(prosody: PublicProsody, emphasized: ReadonlySet<string>, m: Metrics, measure: MeasureText, allowSplit: boolean) {
  let wordsFit = true;
  const lines: LineRows[] = prosody.stanzas.flatMap((stanza) =>
    stanza.lines.map((line) => {
      const wrapped = wrapLine(
        line.words.map((w) => ({ id: w.id, text: w.text, emphasized: emphasized.has(w.id) })),
        m,
        measure,
        allowSplit,
      );
      wordsFit = wordsFit && wrapped.wordsFit;
      return { lineIndex: line.index, stanzaIndex: line.stanzaIndex, rows: wrapped.rows };
    }),
  );
  return { lines, wordsFit };
}

const blockOf = (lines: LineRows[], rowHeight: number): Block => ({
  lines,
  height: lines.reduce((sum, l) => sum + l.rows.length * rowHeight, 0),
});

/** Packs whole stanzas onto pages. A stanza taller than a page is split at line boundaries. */
function pack(lines: LineRows[], m: Metrics, usable: number): Block[][] {
  // Page 0 also carries the title, so it has less room than the others.
  const capacity = (pageNo: number) => usable - (pageNo === 0 ? m.titleHeight : 0);
  const stanzas: LineRows[][] = [];
  for (const line of lines) {
    const last = stanzas[stanzas.length - 1];
    if (last && last[0].stanzaIndex === line.stanzaIndex) last.push(line);
    else stanzas.push([line]);
  }

  const pages: Block[][] = [];
  let current: Block[] = [];
  let used = 0;
  const flush = () => {
    if (current.length) pages.push(current);
    current = [];
    used = 0;
  };

  for (const stanza of stanzas) {
    const block = blockOf(stanza, m.rowHeight);
    const gap = current.length ? m.gap : 0;

    if (used + gap + block.height <= capacity(pages.length)) {
      current.push(block);
      used += gap + block.height;
    } else if (block.height <= capacity(pages.length + (current.length ? 1 : 0))) {
      flush();
      current = [block];
      used = block.height;
    } else {
      flush();
      let chunk: LineRows[] = [];
      let chunkHeight = 0;
      for (const line of stanza) {
        const lineHeight = line.rows.length * m.rowHeight;
        if (chunk.length && chunkHeight + lineHeight > capacity(pages.length)) {
          pages.push([blockOf(chunk, m.rowHeight)]);
          chunk = [];
          chunkHeight = 0;
        }
        chunk.push(line);
        chunkHeight += lineHeight;
      }
      current = [blockOf(chunk, m.rowHeight)];
      used = chunkHeight;
    }
  }
  flush();
  return pages;
}

const pageHeight = (blocks: Block[], gap: number) =>
  blocks.reduce((sum, b) => sum + b.height, 0) + gap * Math.max(0, blocks.length - 1);

/** Largest integer in [lo, hi] where `ok` is true, assuming ok is true for small values and false for large. */
function largestWhere(lo: number, hi: number, ok: (n: number) => boolean): number {
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

interface Plan {
  metrics: Metrics;
  pages: Block[][];
}

/**
 * Picks the font size and page split. A poem is verse, so a line break is a poetic decision: lines are kept
 * whole (one row each) whenever that is possible, in this order of preference:
 *   (a) the largest size (up to maxFontSize) where NO line wraps and everything fits on one page;
 *   (b) if that would be smaller than minFontSize: still no wrapping, but whole stanzas on separate pages,
 *       at the largest size that needs no more pages than minFontSize does;
 *   (c) only if some line cannot fit unwrapped even at minFontSize: stay at minFontSize and wrap just
 *       those lines, with a hanging indent.
 */
function plan(
  prosody: PublicProsody,
  emphasized: ReadonlySet<string>,
  mood: MoodPreset,
  safe: Rect,
  measure: MeasureText,
  titleText: string | null,
): Plan {
  const { maxFontSize, absoluteMinFontSize } = LAYOUT_CONFIG;
  const minFontSize = mood.minFontSize ?? LAYOUT_CONFIG.minFontSize;
  const attempt = (size: number, allowSplit: boolean) => {
    const metrics = metricsFor(size, mood, safe, measure, titleText);
    const { lines, wordsFit } = wrapAll(prosody, emphasized, metrics, measure, allowSplit);
    const tallestLine = lines.reduce((max, l) => Math.max(max, l.rows.length * metrics.rowHeight), 0);
    const pages = pack(lines, metrics, safe.height);
    // pack() puts an over-tall line on a page of its own, so check that every page really fits.
    const pagesFit = pages.every(
      (blocks, i) => pageHeight(blocks, metrics.gap) <= safe.height - (i === 0 ? metrics.titleHeight : 0),
    );
    const unwrapped = wordsFit && lines.every((l) => l.rows.length === 1);
    return { metrics, lines, wordsFit, tallestLine, pages, pagesFit, unwrapped };
  };
  const result = (a: ReturnType<typeof attempt>): Plan => ({ metrics: a.metrics, pages: a.pages });

  // (a) No wrapping, one page.
  const unwrappedOnOnePage = (size: number) => {
    const a = attempt(size, false);
    return a.unwrapped && a.pagesFit && a.pages.length <= 1;
  };
  if (unwrappedOnOnePage(minFontSize)) return result(attempt(largestWhere(minFontSize, maxFontSize, unwrappedOnOnePage), false));

  // (b) No wrapping, but pages.
  const atMinUnwrapped = attempt(minFontSize, false);
  if (atMinUnwrapped.unwrapped && atMinUnwrapped.pagesFit) {
    const pageCount = atMinUnwrapped.pages.length;
    const unwrappedWithinPages = (size: number) => {
      const a = attempt(size, false);
      return a.unwrapped && a.pagesFit && a.pages.length <= pageCount;
    };
    return result(attempt(largestWhere(minFontSize, maxFontSize, unwrappedWithinPages), false));
  }

  // (c) Some line is too long even at the minimum size: it wraps (and an unbreakable word is split).
  let size = minFontSize;
  let a = attempt(size, true);
  // One line alone taller than a page (for example a 2,000-character line): shrink until a line fits a page.
  while (a.tallestLine > safe.height - a.metrics.titleHeight && size > absoluteMinFontSize) {
    size -= 2;
    a = attempt(size, true);
  }
  return result(a);
}

/** Where a page's content starts (the title, if any, first), centred vertically in the content area. */
function pageTop(blocks: Block[], m: Metrics, safe: Rect, pageIndex: number): number {
  const titleHeight = pageIndex === 0 ? m.titleHeight : 0;
  return safe.y + Math.max(0, (safe.height - (titleHeight + pageHeight(blocks, m.gap))) / 2);
}

function placeWords(blocks: Block[], m: Metrics, safe: Rect, align: "left" | "center", pageIndex: number): PlacedWord[] {
  let y = pageTop(blocks, m, safe, pageIndex) + (pageIndex === 0 ? m.titleHeight : 0);

  const placed = new Map<string, PlacedWord>();
  const order: string[] = [];

  blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) y += m.gap;
    for (const line of block.lines) {
      line.rows.forEach((row, rowIndex) => {
        const indent = rowIndex > 0 ? m.indent : 0;
        const rowWidth = row.reduce((sum, item) => sum + item.width, 0) + m.space * Math.max(0, row.length - 1);
        let x = align === "center" ? safe.x + (safe.width - rowWidth) / 2 : safe.x + indent;

        for (const item of row) {
          const piece: Piece = { text: item.text, x, y, width: item.width };
          const existing = placed.get(item.wordId);
          if (existing) existing.pieces.push(piece);
          else {
            order.push(item.wordId);
            placed.set(item.wordId, {
              wordId: item.wordId,
              emphasized: item.emphasized,
              stanzaIndex: line.stanzaIndex,
              lineIndex: line.lineIndex,
              page: pageIndex,
              pieces: [piece],
              box: { x: 0, y: 0, width: 0, height: 0 },
            });
          }
          x += item.width + m.space;
        }
        y += m.rowHeight;
      });
    }
  });

  return order.map((id) => {
    const word = placed.get(id) as PlacedWord;
    const left = Math.min(...word.pieces.map((p) => p.x));
    const top = Math.min(...word.pieces.map((p) => p.y));
    const right = Math.max(...word.pieces.map((p) => p.x + p.width));
    const bottom = Math.max(...word.pieces.map((p) => p.y + m.rowHeight));
    return { ...word, box: { x: left, y: top, width: right - left, height: bottom - top } };
  });
}

const NO_EMPHASIS: ReadonlySet<string> = new Set();

/** What goes around the poem: the user's title (and where), and an optional byline. */
export interface LayoutExtras {
  title?: string;
  titlePlacement?: TitlePlacement;
  byline?: string;
}

const MAX_FOOTER_CHARS = 120;

/** Shrinks text from startSize down to minSize to fit one row; as a last resort cuts it and adds an ellipsis. */
function fitText(
  text: string,
  spec: { family: string; weight: number; italic: boolean },
  startSize: number,
  minSize: number,
  maxWidth: number,
  measure: MeasureText,
) {
  for (let size = Math.floor(startSize); size >= Math.ceil(minSize); size--) {
    const font = fontString({ ...spec, size });
    if (measure(text, font) <= maxWidth) return { text, font };
  }
  const font = fontString({ ...spec, size: Math.ceil(minSize) });
  const [first] = splitToFit(text, maxWidth - measure("\u2026", font), maxWidth, font, measure);
  return { text: (first ?? "") + "\u2026", font };
}

/** Width of text drawn one character at a time with extra space after each. */
function trackedWidth(chars: string[], font: string, trackingPx: number, measure: MeasureText): number {
  return chars.reduce((sum, ch) => sum + measure(ch, font), 0) + trackingPx * Math.max(0, chars.length - 1);
}

/**
 * A letter-spaced line: shrinks to fit, as a last resort cuts the text and adds an ellipsis, and works out where
 * every character goes (relative to the line's left edge).
 */
function fitTracked(text: string, family: string, weight: number, trackingEm: number, maxWidth: number, measure: MeasureText) {
  const minSize = Math.ceil(FOOTER_TITLE_SIZE * LAYOUT_CONFIG.footerMinScale);
  const fontAt = (size: number) => fontString({ family, weight, italic: false, size });
  let chars = graphemes(text);
  const widthAt = (size: number) => trackedWidth(chars, fontAt(size), trackingEm * size, measure);

  // First shrink, down to the smallest allowed size...
  let size = FOOTER_TITLE_SIZE;
  while (size > minSize && widthAt(size) > maxWidth) size--;
  // ...then, if it still does not fit, cut characters from the end and mark the cut. Each pass shortens the line.
  while (widthAt(size) > maxWidth && chars.length > 1) {
    chars = [...chars.slice(0, -2).filter((c) => c !== "\u2026"), "\u2026"];
  }

  const font = fontAt(size);
  const tracking = trackingEm * size;
  const offsets: number[] = [];
  let cursor = 0;
  for (const ch of chars) {
    offsets.push(cursor);
    cursor += measure(ch, font) + tracking;
  }
  return { text: chars.join(""), font, offsets, width: trackedWidth(chars, font, tracking, measure) };
}

/** Title (tracked, uppercase) above byline (italic), bottom-aligned, aligned like the poem. */
function footerLines(
  footer: { title?: string; byline?: string } | undefined,
  mood: MoodPreset,
  format: FormatId,
  safe: Rect,
  measure: MeasureText,
): FooterLine[] {
  if (!footer) return [];
  const { typography, footer: style } = mood;
  const family = typography.display;
  const title = (footer.title ?? "").trim().slice(0, MAX_FOOTER_CHARS).toUpperCase();
  const byline = (footer.byline ?? "").trim().slice(0, MAX_FOOTER_CHARS);

  const lastBaseline =
    format === "reel" ? safe.y + safe.height - LAYOUT_CONFIG.footerBaselineInset.reel : FORMATS.post.height - LAYOUT_CONFIG.footerBaselineInset.post;
  const startX = (width: number) => (typography.align === "center" ? safe.x + (safe.width - width) / 2 : safe.x);
  const lines: FooterLine[] = [];

  if (byline) {
    const fitted = fitText(byline, { family, weight: style.bylineWeight, italic: true }, FOOTER_BYLINE_SIZE, FOOTER_BYLINE_SIZE * LAYOUT_CONFIG.footerMinScale, safe.width, measure);
    lines.push({ text: fitted.text, x: startX(measure(fitted.text, fitted.font)), y: lastBaseline, font: fitted.font });
  }
  if (title) {
    const fitted = fitTracked(title, family, style.weight, style.trackingEm, safe.width, measure);
    const x = startX(fitted.width);
    const y = lastBaseline - (byline ? LAYOUT_CONFIG.footerLineGap : 0);
    lines.unshift({ text: fitted.text, x, y, font: fitted.font, glyphs: Array.from(graphemes(fitted.text), (ch, i) => ({ text: ch, x: x + fitted.offsets[i] })) });
  }
  return lines;
}

/**
 * @param emphasized ids of emphasised words. They are measured in the emphasis font, so they fit as drawn.
 * @param extras the user's title (above the poem, in the footer, or hidden) and an optional byline
 */
export function layout(
  prosody: PublicProsody,
  format: FormatId,
  mood: MoodPreset,
  measureText: MeasureText,
  emphasized: ReadonlySet<string> = NO_EMPHASIS,
  extras: LayoutExtras = {},
): Layout {
  const safeArea = safeAreaFor(format);
  const measure = cachedMeasure(measureText);
  // The poem lives above the footer strip.
  const contentArea: Rect = { ...safeArea, height: safeArea.height - LAYOUT_CONFIG.footerReserve[format] };
  const title = (extras.title ?? "").trim().slice(0, MAX_FOOTER_CHARS);
  const placement = extras.titlePlacement ?? "footer";
  const titleAbove = placement === "above" && title !== "" ? title : null;
  const { metrics, pages } = plan(prosody, emphasized, mood, contentArea, measure, titleAbove);

  const layoutPages: LayoutPage[] = pages.map((blocks, index) => ({
    index,
    words: placeWords(blocks, metrics, contentArea, mood.typography.align, index),
  }));

  const titleBlock: FooterLine | null = metrics.title
    ? {
        text: metrics.title.text,
        x: mood.typography.align === "center" ? contentArea.x + (contentArea.width - metrics.title.width) / 2 : contentArea.x,
        y:
          pageTop(pages[0] ?? [], metrics, contentArea, 0) +
          (metrics.title.fontSize * mood.typography.lineHeight - metrics.title.fontSize) / 2 +
          metrics.title.fontSize * LAYOUT_CONFIG.ascentRatio,
        font: metrics.title.font,
      }
    : null;

  const pageOfLine: number[] = [];
  for (const page of layoutPages) for (const word of page.words) pageOfLine[word.lineIndex] = page.index;

  return {
    format,
    ...FORMATS[format],
    safeArea,
    fontSize: metrics.size,
    rowHeight: metrics.rowHeight,
    font: metrics.font,
    emphasisFont: metrics.emphasisFont,
    baseline: (metrics.rowHeight - metrics.size) / 2 + metrics.size * LAYOUT_CONFIG.ascentRatio,
    pages: layoutPages,
    pageOfLine,
    title: titleBlock,
    footer: footerLines({ title: placement === "footer" ? title : "", byline: extras.byline }, mood, format, safeArea, measure),
  };
}
