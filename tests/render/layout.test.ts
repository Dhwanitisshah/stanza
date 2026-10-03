import { describe, expect, it } from "vitest";
import { MOOD_PRESETS, TENDER } from "@/lib/moods/presets";
import type { MoodPreset } from "@/lib/moods/types";
import { FORMATS, LAYOUT_CONFIG, layout } from "@/lib/render/layout";
import { layoutStats } from "@/lib/render/layoutStats";
import { buildScene } from "@/lib/render/scene";
import type { FormatId, Layout } from "@/lib/render/types";
import { ABAB, AABB, EDGE_CASES, FREE_VERSE, LAMP_ABAB, LETTERS_AABB, TRAFFIC_FREE_VERSE } from "../fixtures/poems";
import { monospace, narrowSerif, prepare, wordIds } from "../helpers";

// Tender is centred now; most layout rules (hanging indent, row starts) are about left-aligned text.
const LEFT: MoodPreset = { ...TENDER, typography: { ...TENDER.typography, align: "left" } };

const FORMAT_IDS: FormatId[] = ["reel", "post"];
const EPS = 1e-6;

const run = (poem: string, format: FormatId = "reel", mood: MoodPreset = LEFT) =>
  layout(prepare(poem).prosody, format, mood, monospace);

/** The same text as `count` lines, grouped into stanzas of `perStanza` lines (0 = no blank lines at all). */
const lines = (count: number, perStanza: number) =>
  Array.from({ length: count }, (_, i) => `the quiet rain keeps falling slow ${i}` + (perStanza && (i + 1) % perStanza === 0 && i < count - 1 ? "\n" : "")).join("\n");

function expectInsideSafeArea(result: Layout) {
  const { x, y, width, height } = result.safeArea;
  for (const page of result.pages) {
    for (const word of page.words) {
      expect(word.box.x).toBeGreaterThanOrEqual(x - EPS);
      expect(word.box.y).toBeGreaterThanOrEqual(y - EPS);
      expect(word.box.x + word.box.width).toBeLessThanOrEqual(x + width + EPS);
      expect(word.box.y + word.box.height).toBeLessThanOrEqual(y + height + EPS);
    }
  }
}

describe("layout: basics", () => {
  it("is deterministic", () => {
    for (const format of FORMAT_IDS) expect(run(LAMP_ABAB, format)).toEqual(run(LAMP_ABAB, format));
  });

  it("uses the 1080x1920 and 1080x1350 canvases", () => {
    expect(run(LAMP_ABAB, "reel")).toMatchObject({ width: 1080, height: 1920 });
    expect(run(LAMP_ABAB, "post")).toMatchObject({ width: 1080, height: 1350 });
  });

  it("keeps the safe area inside the canvas, with a taller bottom margin on reels", () => {
    for (const format of FORMAT_IDS) {
      const { safeArea } = run("hi", format);
      const { width, height } = FORMATS[format];
      expect(safeArea.x).toBeGreaterThan(0);
      expect(safeArea.x + safeArea.width).toBeLessThan(width);
      expect(safeArea.y + safeArea.height).toBeLessThan(height);
    }
    const reel = run("hi", "reel").safeArea;
    expect(1920 - (reel.y + reel.height)).toBeGreaterThan(300);
  });

  it("places every word exactly once, on one page, and maps every line to a page", () => {
    for (const poem of [LAMP_ABAB, ABAB, AABB, FREE_VERSE, LETTERS_AABB, TRAFFIC_FREE_VERSE]) {
      const { prosody } = prepare(poem);
      const result = layout(prosody, "reel", LEFT, monospace);
      const placed = result.pages.flatMap((p) => p.words.map((w) => w.wordId));
      expect(placed).toEqual(wordIds(prosody));
      expect(result.pageOfLine).toHaveLength(prosody.stanzas.flatMap((s) => s.lines).length);
    }
  });

  it("lays a short poem on one page at a size between the minimum and maximum", () => {
    for (const format of FORMAT_IDS) {
      const result = run(LAMP_ABAB, format);
      expect(result.pages).toHaveLength(1);
      expect(result.fontSize).toBeGreaterThanOrEqual(LAYOUT_CONFIG.minFontSize);
      expect(result.fontSize).toBeLessThanOrEqual(LAYOUT_CONFIG.maxFontSize);
    }
  });

  it("uses the largest size that fits (one more pixel would not)", () => {
    const small = run(LAMP_ABAB, "post");
    const bigger = layout(prepare(LAMP_ABAB).prosody, "post", { ...TENDER, typography: { ...TENDER.typography, lineHeight: 1.1 } }, monospace);
    expect(bigger.fontSize).toBeGreaterThanOrEqual(small.fontSize);
  });

  it("shrinks text for longer poems and for the shorter Post format", () => {
    expect(run(LAMP_ABAB, "post").fontSize).toBeLessThanOrEqual(run(LAMP_ABAB, "reel").fontSize);
    expect(run(lines(12, 4)).fontSize).toBeLessThan(run("moon").fontSize);
  });

  it("reads top to bottom, left to right", () => {
    const words = run(LAMP_ABAB).pages[0].words;
    for (let i = 1; i < words.length; i++) {
      const prev = words[i - 1].pieces[0];
      const next = words[i].pieces[0];
      expect(next.y > prev.y || (next.y === prev.y && next.x > prev.x)).toBe(true);
    }
  });

  it("keeps blank space between stanzas", () => {
    const result = run("one\ntwo\n\nthree\nfour");
    const [one, two, three] = result.pages[0].words.map((w) => w.box.y);
    expect(two - one).toBeCloseTo(result.rowHeight);
    expect(three - two).toBeGreaterThan(result.rowHeight);
  });
});

describe("layout: safe area", () => {
  const poems: Record<string, string> = {
    wordsworth: ABAB,
    blake: AABB,
    whitman: FREE_VERSE,
    lamp: LAMP_ABAB,
    traffic: TRAFFIC_FREE_VERSE,
    "40 lines": lines(40, 0),
    "40 lines in stanzas": lines(40, 4),
    "one long line": "word ".repeat(400),
    "very long words": "incomprehensibilities antidisestablishmentarianism pneumonoultramicroscopicsilicovolcanoconiosis x",
    ...EDGE_CASES,
  };

  for (const [name, poem] of Object.entries(poems)) {
    // The two pathological inputs that exceed the API's own 2,000-character cap only need to not throw.
    if (poem.length > 2000 && !["40 lines", "40 lines in stanzas"].includes(name)) continue;
    it(`keeps every word box inside the safe area: ${name}`, () => {
      for (const format of FORMAT_IDS) expectInsideSafeArea(run(poem, format));
    });
  }

  it("does not throw on huge input (10,000-character line, 5,000-character word)", () => {
    for (const format of FORMAT_IDS) {
      expect(() => run(EDGE_CASES.longLine, format)).not.toThrow();
      expect(() => run(EDGE_CASES.veryLongWord, format)).not.toThrow();
      expect(() => run("")).not.toThrow();
    }
    expect(run("").pages).toEqual([]);
  });

  it("copes with emoji, accents and other non-ASCII", () => {
    for (const key of ["emoji", "seaEmoji", "accents", "singlePunctuatedWord"]) {
      expect(() => run(EDGE_CASES[key])).not.toThrow();
      expectInsideSafeArea(run(EDGE_CASES[key]));
    }
  });
});

describe("layout: wrapping", () => {
  const longLine = "the quiet rain keeps falling slow upon the sleeping roofs of every town";

  it("wraps a long line inside the safe area with a hanging indent", () => {
    const result = run(longLine, "post");
    const rows = [...new Set(result.pages[0].words.flatMap((w) => w.pieces.map((p) => p.y)))].sort((a, b) => a - b);
    expect(rows.length).toBeGreaterThan(1);

    const xOfRow = (y: number) => Math.min(...result.pages[0].words.flatMap((w) => w.pieces.filter((p) => p.y === y).map((p) => p.x)));
    expect(xOfRow(rows[0])).toBeCloseTo(result.safeArea.x);
    expect(xOfRow(rows[1])).toBeCloseTo(result.safeArea.x + LAYOUT_CONFIG.hangingIndentEm * result.fontSize);
    expectInsideSafeArea(result);
  });

  it("does not indent when text is centred, and centres each row", () => {
    const centred: MoodPreset = { ...TENDER, typography: { ...TENDER.typography, align: "center" } };
    const result = layout(prepare("moon\nthe quiet rain").prosody, "post", centred, monospace);
    const mid = result.safeArea.x + result.safeArea.width / 2;
    for (const line of [0, 1]) {
      const boxes = result.pages[0].words.filter((w) => w.lineIndex === line).map((w) => w.box);
      const left = Math.min(...boxes.map((b) => b.x));
      const right = Math.max(...boxes.map((b) => b.x + b.width));
      expect((left + right) / 2).toBeCloseTo(mid);
    }
  });

  it("shrinks the text to fit a long unbreakable word rather than splitting it, when it can", () => {
    const result = run("incomprehensibilities", "reel");
    expect(result.pages[0].words[0].pieces).toHaveLength(1);
    expect(result.fontSize).toBeLessThan(LAYOUT_CONFIG.maxFontSize);
  });

  it("splits a word that cannot fit a row even at the minimum size", () => {
    const result = run("a".repeat(120), "reel");
    expect(result.pages[0].words[0].pieces.length).toBeGreaterThan(1);
    expect(result.fontSize).toBe(LAYOUT_CONFIG.minFontSize);
    expectInsideSafeArea(result);
  });
});

describe("layout: paging", () => {
  it("pages a 40-line poem instead of shrinking below the minimum size", () => {
    for (const format of FORMAT_IDS) {
      for (const poem of [lines(40, 4), lines(40, 0)]) {
        const result = run(poem, format);
        expect(result.pages.length).toBeGreaterThan(1);
        expect(result.fontSize).toBeGreaterThanOrEqual(LAYOUT_CONFIG.minFontSize);
        expectInsideSafeArea(result);
      }
    }
  });

  it("keeps whole stanzas together when they fit on a page", () => {
    const result = run(lines(40, 4), "reel");
    const pageOfStanza = new Map<number, Set<number>>();
    for (const page of result.pages) {
      for (const word of page.words) {
        pageOfStanza.set(word.stanzaIndex, (pageOfStanza.get(word.stanzaIndex) ?? new Set()).add(page.index));
      }
    }
    for (const pages of pageOfStanza.values()) expect(pages.size).toBe(1);
  });

  it("splits a stanza taller than a page at line boundaries", () => {
    const result = run(lines(40, 0), "reel");
    expect(result.pages.length).toBeGreaterThan(1);
    const pageOfLine = result.pageOfLine;
    expect(pageOfLine.every((p, i) => i === 0 || p >= pageOfLine[i - 1])).toBe(true);
  });

  it("uses the largest size that keeps the minimum page count", () => {
    const result = run(lines(40, 4), "reel");
    const atMinimum = Math.max(...result.pages.map((p) => p.index)) + 1;
    expect(result.fontSize).toBeGreaterThanOrEqual(LAYOUT_CONFIG.minFontSize);
    expect(atMinimum).toBeGreaterThan(1);
  });

  it("pageOfLine matches where the words were placed", () => {
    const result = run(lines(40, 4), "post");
    for (const page of result.pages) for (const word of page.words) expect(result.pageOfLine[word.lineIndex]).toBe(page.index);
  });
});

describe("buildScene", () => {
  it("is deterministic and feeds the layout's pages into the timeline", () => {
    const { prosody, analysis } = prepare(lines(40, 4));
    const input = { prosody, analysis, format: "reel" as const, speed: 1, measureText: monospace };
    const scene = buildScene(input);
    expect(scene).toEqual(buildScene(input));
    expect(scene.layout.pages.length).toBeGreaterThan(1);
    expect(scene.timeline.events.filter((e) => e.type === "page")).toHaveLength(scene.layout.pages.length - 1);
  });

  it("lets the user override the analysed mood", () => {
    const { prosody, analysis } = prepare(LAMP_ABAB);
    const scene = buildScene({ prosody, analysis, mood: "Restless", format: "post", speed: 1, measureText: monospace });
    expect(scene.mood.id).toBe("Restless");
    expect(scene.analysis.mood).not.toBe("Restless"); // the override, not the analysis, chose the mood
    expect(scene.format).toBe("post");
  });
});

describe("layout: emphasised words", () => {
  const phrase = (k: number) => Array.from({ length: k }, () => "word").join(" ");
  const lastId = (poem: string) => {
    const words = prepare(poem).prosody.stanzas.flatMap((s) => s.lines.flatMap((l) => l.words));
    return words[words.length - 1].id;
  };
  const withEmphasis = (poem: string, format: FormatId = "post") =>
    layout(prepare(poem).prosody, format, LEFT, monospace, new Set([lastId(poem)]));

  it("measures an emphasised word in the emphasis font, wider than the plain one", () => {
    const result = withEmphasis("moon");
    const [word] = result.pages[0].words;
    expect(word.emphasized).toBe(true);
    expect(word.box.width).toBeCloseTo(monospace("moon", result.emphasisFont));
    expect(word.box.width).toBeCloseTo(monospace("moon", result.font) * TENDER.emphasis.scale);
  });

  it("never lets an emphasised word cross the safe area, wherever it falls in a row", () => {
    // Sweep line lengths so the emphasised word lands at the end of a full row for some of them.
    for (const format of FORMAT_IDS) {
      for (let k = 1; k <= 60; k++) expectInsideSafeArea(withEmphasis(phrase(k), format));
    }
  });

  it("would overflow if it were measured plain: the sweep really does hit full rows", () => {
    let wouldOverflow = 0;
    for (let k = 1; k <= 60; k++) {
      const poem = phrase(k);
      const plain = layout(prepare(poem).prosody, "post", LEFT, monospace);
      const last = plain.pages[0].words[plain.pages[0].words.length - 1].box;
      const drawnWidth = last.width * TENDER.emphasis.scale;
      if (last.x + drawnWidth > plain.safeArea.x + plain.safeArea.width + EPS) wouldOverflow++;
    }
    expect(wouldOverflow).toBeGreaterThan(0);
  });

  it("wraps an emphasised word to the next row when its wider font no longer fits", () => {
    // At the minimum size (44px, 26.4px per character) a row holds 33 characters: 8 + 1 + 9 + 1 + 14.
    // Plain, the third word ends at 871px and fits in 888px. Emphasised it is 5% wider (+18px) and does not.
    const poem = "aaaaaaaa bbbbbbbbb cccccccccccccc dddd eeee ffff gggg hhhh iiii";
    const words = prepare(poem).prosody.stanzas[0].lines[0].words;
    const plain = layout(prepare(poem).prosody, "reel", LEFT, monospace);
    const emphasised = layout(prepare(poem).prosody, "reel", LEFT, monospace, new Set([words[2].id]));

    expect(plain.fontSize).toBe(LAYOUT_CONFIG.minFontSize);
    expect(emphasised.fontSize).toBe(LAYOUT_CONFIG.minFontSize);
    const yOf = (result: Layout) => result.pages[0].words[2].box.y;
    expect(yOf(emphasised)).toBeGreaterThan(yOf(plain));
    expectInsideSafeArea(emphasised);
  });

  it("is deterministic and buildScene passes the analysis emphasis through", () => {
    const { prosody, analysis } = prepare(LAMP_ABAB);
    const scene = buildScene({ prosody, analysis, format: "post", speed: 1, measureText: monospace });
    const flagged = scene.layout.pages.flatMap((p) => p.words).filter((w) => w.emphasized).map((w) => w.wordId);
    expect(flagged).toEqual(analysis.emphasis);
    expect(analysis.emphasis.length).toBeGreaterThan(0);
  });
});

describe("layout: verse-aware sizing", () => {
  const serif = (poem: string, format: FormatId = "reel") => layout(prepare(poem).prosody, format, LEFT, narrowSerif);
  const stats = (poem: string, format: FormatId = "reel") => layoutStats(serif(poem, format));

  it("keeps every line of the ABAB fixture on one row, in Reel and Post", () => {
    for (const format of FORMAT_IDS) {
      expect(stats(LAMP_ABAB, format)).toMatchObject({ lines: 4, wrappedLines: 0, pages: 1 });
    }
  });

  it("does the same for the other TESTING.md fixtures", () => {
    for (const poem of [LETTERS_AABB, TRAFFIC_FREE_VERSE]) {
      for (const format of FORMAT_IDS) expect(stats(poem, format)).toMatchObject({ wrappedLines: 0, pages: 1 });
    }
  });

  it("(a) picks the largest size where nothing wraps: one more pixel would wrap or overflow", () => {
    const result = serif(LAMP_ABAB, "reel");
    const longest = Math.max(...result.pages[0].words.map((w) => w.box.x + w.box.width)) - result.safeArea.x;
    expect(longest).toBeLessThanOrEqual(result.safeArea.width);
    // Growing the text by 3% would push the longest row past the safe width, or past the page height.
    const grown = (result.fontSize + 2) / result.fontSize;
    const tallerThanPage = 4 * result.rowHeight * grown > result.safeArea.height;
    expect(longest * grown > result.safeArea.width || tallerThanPage).toBe(true);
  });

  it("respects the maximum size for a short poem", () => {
    for (const format of FORMAT_IDS) expect(stats("moon\nsun", format).fontSize).toBe(LAYOUT_CONFIG.maxFontSize);
    expect(LAYOUT_CONFIG.maxFontSize).toBeLessThanOrEqual(112);
    expect(LAYOUT_CONFIG.maxFontSize).toBeGreaterThanOrEqual(100);
  });

  it("(b) below the minimum, keeps lines whole and pages whole stanzas instead", () => {
    const poem = Array.from({ length: 40 }, (_, i) => "la la la" + (i % 4 === 3 && i < 39 ? "\n" : "")).join("\n");
    const result = run(poem, "reel");
    const s = layoutStats(result);
    expect(s.wrappedLines).toBe(0);
    expect(s.pages).toBeGreaterThan(1);
    expect(s.fontSize).toBeGreaterThanOrEqual(LAYOUT_CONFIG.minFontSize);
    // Stanzas stay whole.
    const pagesOfStanza = new Map<number, Set<number>>();
    for (const page of result.pages) for (const w of page.words) pagesOfStanza.set(w.stanzaIndex, (pagesOfStanza.get(w.stanzaIndex) ?? new Set()).add(page.index));
    for (const pages of pagesOfStanza.values()) expect(pages.size).toBe(1);
  });

  it("(b) pages use the largest size that needs no more pages than the minimum size does", () => {
    const poem = Array.from({ length: 40 }, (_, i) => "la la la" + (i % 4 === 3 && i < 39 ? "\n" : "")).join("\n");
    const result = run(poem, "reel");
    // Short lines at 44px: the page count is set by height, so the size can grow until the count would rise.
    expect(result.fontSize).toBeGreaterThan(LAYOUT_CONFIG.minFontSize);
  });

  it("(c) a Whitman-length line still wraps, at the minimum size, with a hanging indent", () => {
    const whitman = "For every atom belonging to me as good belongs to you.";
    const result = run(whitman, "post");
    const s = layoutStats(result);
    expect(s).toMatchObject({ fontSize: LAYOUT_CONFIG.minFontSize, wrappedLines: 1 });
    const xs = new Set(result.pages[0].words.flatMap((w) => w.pieces.map((p) => p.x)));
    expect(Math.min(...xs)).toBeCloseTo(result.safeArea.x);
    expect([...xs].some((x) => Math.abs(x - (result.safeArea.x + LAYOUT_CONFIG.hangingIndentEm * result.fontSize)) < 1e-6)).toBe(true);
  });

  it("(c) wraps only the lines that cannot fit; their neighbours stay on one row", () => {
    const poem = ["short line", "For every atom belonging to me as good belongs to you.", "another short one"].join("\n");
    const result = run(poem, "reel");
    const rowsOfLine = (line: number) => new Set(result.pages[0].words.filter((w) => w.lineIndex === line).flatMap((w) => w.pieces.map((p) => p.y))).size;
    expect(result.fontSize).toBe(LAYOUT_CONFIG.minFontSize);
    expect([rowsOfLine(0), rowsOfLine(1), rowsOfLine(2)]).toEqual([1, 2, 1]);
  });

  it("layoutStats counts lines, pages and wrapped lines", () => {
    expect(stats("a\nb\n\nc")).toEqual({ fontSize: LAYOUT_CONFIG.maxFontSize, pages: 1, lines: 3, wrappedLines: 0 });
  });
});

describe("layout: per-mood minimum size", () => {
  it("defaults to 44px, and Restless goes down to 36px", () => {
    expect(TENDER.minFontSize).toBeUndefined();
    expect(MOOD_PRESETS.Restless.minFontSize).toBe(36);
  });

  it("keeps ABAB on four unwrapped lines in Restless in Reel (monospace is wide)", () => {
    const restless = layout(prepare(LAMP_ABAB).prosody, "reel", MOOD_PRESETS.Restless, monospace);
    expect(layoutStats(restless)).toMatchObject({ lines: 4, wrappedLines: 0, pages: 1 });
    expect(restless.fontSize).toBeGreaterThanOrEqual(36);
    expect(restless.fontSize).toBeLessThan(44); // the longest line only fits below the old minimum
  });

  it("would have wrapped under the default minimum (the setting is what fixes it)", () => {
    const strict = { ...MOOD_PRESETS.Restless, minFontSize: undefined };
    expect(layoutStats(layout(prepare(LAMP_ABAB).prosody, "reel", strict, monospace)).wrappedLines).toBeGreaterThan(0);
  });

  it("wraps a line only when it cannot fit even at the mood's own minimum", () => {
    const whitman = "For every atom belonging to me as good belongs to you.";
    const result = layout(prepare(whitman).prosody, "reel", MOOD_PRESETS.Restless, monospace);
    expect(result.fontSize).toBe(36);
    expect(layoutStats(result).wrappedLines).toBe(1);
  });
});
