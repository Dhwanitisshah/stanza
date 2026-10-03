import { describe, expect, it } from "vitest";
import { TENDER } from "@/lib/moods/presets";
import type { MoodPreset } from "@/lib/moods/types";
import { FORMATS, LAYOUT_CONFIG, layout } from "@/lib/render/layout";
import { buildScene } from "@/lib/render/scene";
import type { FormatId, Layout } from "@/lib/render/types";
import { ABAB, AABB, EDGE_CASES, FREE_VERSE, LAMP_ABAB, LETTERS_AABB, TRAFFIC_FREE_VERSE } from "../fixtures/poems";
import { monospace, prepare, wordIds } from "../helpers";

const FORMAT_IDS: FormatId[] = ["reel", "post"];
const EPS = 1e-6;

const run = (poem: string, format: FormatId = "reel", mood: MoodPreset = TENDER) =>
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
      const result = layout(prosody, "reel", TENDER, monospace);
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
    expect(scene.mood.id).toBe("Tender"); // Phase 3a: only Tender exists, others fall back to it
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
    layout(prepare(poem).prosody, format, TENDER, monospace, new Set([lastId(poem)]));

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
      const plain = layout(prepare(poem).prosody, "post", TENDER, monospace);
      const last = plain.pages[0].words[plain.pages[0].words.length - 1].box;
      const drawnWidth = last.width * TENDER.emphasis.scale;
      if (last.x + drawnWidth > plain.safeArea.x + plain.safeArea.width + EPS) wouldOverflow++;
    }
    expect(wouldOverflow).toBeGreaterThan(0);
  });

  it("wraps an emphasised word to the next row when it no longer fits", () => {
    let wrappedDifferently = 0;
    for (let k = 1; k <= 60; k++) {
      const poem = phrase(k);
      const plain = layout(prepare(poem).prosody, "post", TENDER, monospace);
      const emphasised = withEmphasis(poem);
      const lastPlain = plain.pages[0].words[plain.pages[0].words.length - 1];
      const lastEmph = emphasised.pages[0].words[emphasised.pages[0].words.length - 1];
      if (plain.fontSize === emphasised.fontSize && lastPlain.box.y !== lastEmph.box.y) wrappedDifferently++;
    }
    expect(wrappedDifferently).toBeGreaterThan(0);
  });

  it("is deterministic and buildScene passes the analysis emphasis through", () => {
    const { prosody, analysis } = prepare(LAMP_ABAB);
    const scene = buildScene({ prosody, analysis, format: "post", speed: 1, measureText: monospace });
    const flagged = scene.layout.pages.flatMap((p) => p.words).filter((w) => w.emphasized).map((w) => w.wordId);
    expect(flagged).toEqual(analysis.emphasis);
    expect(analysis.emphasis.length).toBeGreaterThan(0);
  });
});
