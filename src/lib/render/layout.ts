// PURE: decides where every word sits in the FINAL poster. The last frame of the animation is this layout.
// `measureText` is injected so tests (and the CLI) run without a browser; the app passes a canvas-backed one.
import type { MoodPreset } from "@/lib/moods/types";
import type { PublicProsody } from "@/lib/prosody";
import type { FormatId, Layout, LayoutPage, MeasureText, Piece, PlacedWord, Rect } from "./types";

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
  /** ~44px on a 1080-wide poster is about 16pt on a phone screen: the smallest comfortable size. */
  minFontSize: 44,
  maxFontSize: 112,
  /** Only for pathological input (e.g. one 2,000-character line): shrink past the minimum rather than overflow. */
  absoluteMinFontSize: 12,
  /** Wrapped rows are indented by this many em (left-aligned moods only). */
  hangingIndentEm: 1,
  /** Extra space between stanzas, in em. */
  stanzaGapEm: 0.8,
} as const;

// ---------- internals ----------

interface RowItem {
  wordId: string;
  text: string;
  width: number;
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
  rowHeight: number;
  gap: number;
  indent: number;
  space: number;
  availFirst: number;
  availNext: number;
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
  words: { id: string; text: string }[],
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
    const width = measure(word.text, m.font);
    const current = rows[rows.length - 1];
    const needed = current.length ? used + m.space + width : width;

    if (needed <= avail()) {
      used = needed;
      current.push({ wordId: word.id, text: word.text, width });
      continue;
    }
    if (current.length) newRow();
    if (width <= avail()) {
      rows[rows.length - 1].push({ wordId: word.id, text: word.text, width });
      used = width;
      continue;
    }

    wordsFit = false;
    if (!allowSplit) {
      rows[rows.length - 1].push({ wordId: word.id, text: word.text, width });
      used = width;
      continue;
    }
    const chunks = splitToFit(word.text, avail(), m.availNext, m.font, measure);
    chunks.forEach((chunk, i) => {
      if (i > 0) newRow();
      const chunkWidth = measure(chunk, m.font);
      rows[rows.length - 1].push({ wordId: word.id, text: chunk, width: chunkWidth });
      used = chunkWidth;
    });
  }
  return { rows, wordsFit };
}

function metricsFor(size: number, mood: MoodPreset, safe: Rect, measure: MeasureText): Metrics {
  const font = `${mood.typography.weight} ${size}px ${mood.typography.display}`;
  const indent = mood.typography.align === "left" ? LAYOUT_CONFIG.hangingIndentEm * size : 0;
  return {
    size,
    font,
    rowHeight: size * mood.typography.lineHeight,
    gap: LAYOUT_CONFIG.stanzaGapEm * size,
    indent,
    space: measure(" ", font),
    availFirst: safe.width,
    availNext: safe.width - indent,
  };
}

function wrapAll(prosody: PublicProsody, m: Metrics, measure: MeasureText, allowSplit: boolean) {
  let wordsFit = true;
  const lines: LineRows[] = prosody.stanzas.flatMap((stanza) =>
    stanza.lines.map((line) => {
      const wrapped = wrapLine(
        line.words.map((w) => ({ id: w.id, text: w.text })),
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

    if (used + gap + block.height <= usable) {
      current.push(block);
      used += gap + block.height;
    } else if (block.height <= usable) {
      flush();
      current = [block];
      used = block.height;
    } else {
      flush();
      let chunk: LineRows[] = [];
      let chunkHeight = 0;
      for (const line of stanza) {
        const lineHeight = line.rows.length * m.rowHeight;
        if (chunk.length && chunkHeight + lineHeight > usable) {
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

/** Picks the font size and page split. See the plan in the Phase 3a DEVLOG entry. */
function plan(prosody: PublicProsody, mood: MoodPreset, safe: Rect, measure: MeasureText): Plan {
  const { minFontSize, maxFontSize, absoluteMinFontSize } = LAYOUT_CONFIG;
  const attempt = (size: number, allowSplit: boolean) => {
    const metrics = metricsFor(size, mood, safe, measure);
    const { lines, wordsFit } = wrapAll(prosody, metrics, measure, allowSplit);
    const tallestLine = lines.reduce((max, l) => Math.max(max, l.rows.length * metrics.rowHeight), 0);
    const pages = pack(lines, metrics, safe.height);
    // pack() puts an over-tall line on a page of its own, so check that every page really fits.
    const pagesFit = pages.every((blocks) => pageHeight(blocks, metrics.gap) <= safe.height);
    return { metrics, lines, wordsFit, tallestLine, pages, pagesFit };
  };
  const result = (a: ReturnType<typeof attempt>): Plan => ({ metrics: a.metrics, pages: a.pages });

  // 1. Everything on one page at the largest size that fits.
  const fitsOnePage = (size: number) => {
    const a = attempt(size, false);
    return a.wordsFit && a.pagesFit && a.pages.length <= 1;
  };
  if (fitsOnePage(minFontSize)) return result(attempt(largestWhere(minFontSize, maxFontSize, fitsOnePage), false));

  // 2. Too much text for one page at the minimum size: split into pages.
  const atMin = attempt(minFontSize, true);
  if (atMin.tallestLine > safe.height) {
    // One line alone is taller than a page (e.g. a 2,000-character line): shrink until a line fits a page.
    let size = minFontSize;
    let a = atMin;
    while (a.tallestLine > safe.height && size > absoluteMinFontSize) {
      size -= 2;
      a = attempt(size, true);
    }
    return result(a);
  }

  // Same page count as at the minimum size, but with the largest text that still achieves it.
  const pageCount = atMin.pages.length;
  const paged = (size: number) => {
    const a = attempt(size, false);
    return a.wordsFit && a.pagesFit && a.pages.length <= pageCount;
  };
  const size = largestWhere(minFontSize, maxFontSize, paged);
  return result(size === minFontSize ? atMin : attempt(size, false));
}

function placeWords(blocks: Block[], m: Metrics, safe: Rect, align: "left" | "center", pageIndex: number): PlacedWord[] {
  const contentHeight = pageHeight(blocks, m.gap);
  let y = safe.y + Math.max(0, (safe.height - contentHeight) / 2);

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

export function layout(prosody: PublicProsody, format: FormatId, mood: MoodPreset, measureText: MeasureText): Layout {
  const safeArea = safeAreaFor(format);
  const measure = cachedMeasure(measureText);
  const { metrics, pages } = plan(prosody, mood, safeArea, measure);

  const layoutPages: LayoutPage[] = pages.map((blocks, index) => ({
    index,
    words: placeWords(blocks, metrics, safeArea, mood.typography.align, index),
  }));

  const pageOfLine: number[] = [];
  for (const page of layoutPages) for (const word of page.words) pageOfLine[word.lineIndex] = page.index;

  return {
    format,
    ...FORMATS[format],
    safeArea,
    fontSize: metrics.size,
    rowHeight: metrics.rowHeight,
    font: metrics.font,
    pages: layoutPages,
    pageOfLine,
  };
}
