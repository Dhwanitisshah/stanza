import { describe, expect, it } from "vitest";
import { MOOD_PRESETS, TENDER } from "@/lib/moods/presets";
import type { MoodPreset } from "@/lib/moods/types";
import { LAYOUT_CONFIG, layout } from "@/lib/render/layout";
import { layoutStats } from "@/lib/render/layoutStats";
import { renderFrame } from "@/lib/render/renderFrame";
import { buildScene } from "@/lib/render/scene";
import type { FormatId, Scene, TitlePlacement } from "@/lib/render/types";
import { buildTimeline } from "@/lib/timeline/buildTimeline";
import { TIMING } from "@/lib/timeline/config";
import { FORTY_LINES, LAMP_ABAB } from "../fixtures/poems";
import { monospace, narrowSerif, prepare } from "../helpers";
import { RecordingContext } from "../recorder";

const TITLE = "A Patient Moon";
const build = (poem: string, placement: TitlePlacement | undefined, title: string | undefined = TITLE, extra: { mood?: MoodPreset["id"]; format?: FormatId; byline?: string } = {}) => {
  const { prosody, analysis } = prepare(poem);
  return buildScene({ prosody, analysis, title, titlePlacement: placement, byline: extra.byline, mood: extra.mood, format: extra.format ?? "reel", speed: 1, measureText: narrowSerif });
};
const draw = (scene: Scene, t: number) => {
  const ctx = new RecordingContext();
  renderFrame(ctx.asContext(), scene, t);
  return ctx;
};
const EPS = 1e-6;

describe("title placement: layout", () => {
  it("above: the title sits above the first word, inside the safe area, and the poem is below it", () => {
    const scene = build(LAMP_ABAB, "above");
    const { title, safeArea, footer } = scene.layout;
    expect(title).not.toBeNull();
    expect(title!.text).toBe(TITLE);
    const firstWord = scene.layout.pages[0].words[0];
    expect(title!.y).toBeLessThan(firstWord.box.y);
    expect(title!.y).toBeGreaterThanOrEqual(safeArea.y);
    expect(footer).toHaveLength(0); // no byline, and the title is not repeated in the footer
  });

  it("footer: the title goes to the footer strip and nothing is drawn above the poem", () => {
    const scene = build(LAMP_ABAB, "footer");
    expect(scene.layout.title).toBeNull();
    expect(scene.layout.footer.map((l) => l.text)).toEqual([TITLE]);
  });

  it("hidden: no title anywhere, but the byline still shows", () => {
    const scene = build(LAMP_ABAB, "hidden", TITLE, { byline: "— me" });
    expect(scene.layout.title).toBeNull();
    expect(scene.layout.footer.map((l) => l.text)).toEqual(["— me"]);
  });

  it("defaults to the footer, and an empty or blank title shows nothing", () => {
    expect(build(LAMP_ABAB, undefined).layout.footer).toHaveLength(1);
    for (const title of ["", "   "]) {
      const scene = build(LAMP_ABAB, "above", title);
      expect(scene.layout.title).toBeNull();
      expect(scene.layout.footer).toHaveLength(0);
    }
  });

  it("above + byline: the title is above the poem and only the byline is in the footer", () => {
    const scene = build(LAMP_ABAB, "above", TITLE, { byline: "— me" });
    expect(scene.layout.title?.text).toBe(TITLE);
    expect(scene.layout.footer.map((l) => l.text)).toEqual(["— me"]);
  });

  it("uses a larger size than the poem, and the poem's typeface", () => {
    const scene = build(LAMP_ABAB, "above");
    const px = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)![1]);
    expect(px(scene.layout.title!.font)).toBeGreaterThan(px(scene.layout.font));
    expect(px(scene.layout.title!.font)).toBeLessThanOrEqual(px(scene.layout.font) * LAYOUT_CONFIG.titleScale + 1);
    expect(scene.layout.title!.font).toContain("Cormorant");
  });

  it("is aligned like the poem: centred for centred moods, at the left edge for left-aligned ones", () => {
    const centred = build(LAMP_ABAB, "above"); // Tender
    const t = centred.layout.title!;
    const width = narrowSerif(t.text, t.font);
    expect(t.x + width / 2).toBeCloseTo(centred.layout.safeArea.x + centred.layout.safeArea.width / 2, 3);
    const left = build(LAMP_ABAB, "above", TITLE, { mood: "Melancholy" });
    expect(left.layout.title!.x).toBeCloseTo(left.layout.safeArea.x);
  });

  it("never makes the poem bigger, and keeps the whole block inside the safe area", () => {
    for (const format of ["reel", "post"] as const) {
      const without = build(LAMP_ABAB, "hidden", TITLE, { format });
      const withTitle = build(LAMP_ABAB, "above", TITLE, { format });
      expect(withTitle.layout.fontSize).toBeLessThanOrEqual(without.layout.fontSize);
      const { x, y, width, height } = withTitle.layout.safeArea;
      const t = withTitle.layout.title!;
      expect(t.x).toBeGreaterThanOrEqual(x - EPS);
      expect(t.x + narrowSerif(t.text, t.font)).toBeLessThanOrEqual(x + width + EPS);
      for (const w of withTitle.layout.pages[0].words) {
        expect(w.box.y).toBeGreaterThanOrEqual(y - EPS);
        expect(w.box.y + w.box.height).toBeLessThanOrEqual(y + height + EPS);
        expect(w.box.y).toBeGreaterThan(t.y); // below the title's baseline
      }
    }
  });

  it("makes room for the title on a tall poem by using a smaller size or another page, never overlapping", () => {
    const withTitle = build(FORTY_LINES, "above");
    const stats = layoutStats(withTitle.layout);
    expect(stats.fontSize).toBeGreaterThanOrEqual(LAYOUT_CONFIG.minFontSize);
    const t = withTitle.layout.title!;
    const first = withTitle.layout.pages[0].words[0];
    expect(first.box.y).toBeGreaterThan(t.y);
    for (const page of withTitle.layout.pages) for (const w of page.words) expect(w.box.y + w.box.height).toBeLessThanOrEqual(withTitle.layout.safeArea.y + withTitle.layout.safeArea.height + EPS);
  });

  it("shrinks, then cuts, a title that is too long for one row", () => {
    const scene = build(LAMP_ABAB, "above", "word ".repeat(40).trim());
    const t = scene.layout.title!;
    expect(narrowSerif(t.text, t.font)).toBeLessThanOrEqual(scene.layout.safeArea.width + EPS);
    expect(t.text.endsWith("…")).toBe(true);
    const px = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)![1]);
    expect(px(t.font)).toBeGreaterThanOrEqual(px(scene.layout.font) * LAYOUT_CONFIG.titleMinScale - 1);
  });

  it("is deterministic and leaves the poem's own wording untouched", () => {
    expect(build(LAMP_ABAB, "above").layout).toEqual(build(LAMP_ABAB, "above").layout);
    const placed = build(LAMP_ABAB, "above").layout.pages[0].words.flatMap((w) => w.pieces.map((p) => p.text));
    expect(placed).toEqual(prepare(LAMP_ABAB).prosody.stanzas[0].lines.flatMap((l) => l.words.map((w) => w.text)));
  });

  it("works in every mood and both formats without throwing", () => {
    for (const mood of Object.values(MOOD_PRESETS)) {
      for (const format of ["reel", "post"] as const) {
        const { prosody } = prepare(LAMP_ABAB);
        expect(() => layout(prosody, format, mood, monospace, new Set(), { title: TITLE, titlePlacement: "above" })).not.toThrow();
      }
    }
  });
});

describe("title placement: timeline", () => {
  const { prosody, analysis } = prepare(LAMP_ABAB);
  const timeline = (title: boolean) => buildTimeline(prosody, analysis, TENDER, 1, [], { title });

  it("fades the title in first and makes the first word wait for it", () => {
    const withTitle = timeline(true);
    const without = timeline(false);
    const titleEvent = withTitle.events.find((e) => e.type === "title")!;
    expect(titleEvent).toMatchObject({ start: TIMING.leadInMs, duration: TIMING.titleFadeMs });
    const firstWord = withTitle.events.find((e) => e.type === "appear")!;
    expect(firstWord.start).toBe(TIMING.leadInMs + TIMING.titleLeadMs);
    expect(titleEvent.start + titleEvent.duration).toBeLessThanOrEqual(firstWord.start + TIMING.titleFadeMs);
    expect(withTitle.totalMs - without.totalMs).toBe(TIMING.titleLeadMs);
    expect(without.events.some((e) => e.type === "title")).toBe(false);
  });

  it("can drop the echoes", () => {
    const quiet = buildTimeline(prosody, analysis, TENDER, 1, [], { echoes: false });
    expect(quiet.events.some((e) => e.type === "echo")).toBe(false);
    expect(timeline(false).events.some((e) => e.type === "echo")).toBe(true);
  });

  it("emits no title event for an empty poem", () => {
    const empty = prepare("");
    expect(buildTimeline(empty.prosody, empty.analysis, TENDER, 1, [], { title: true }).events).toEqual([]);
  });
});

describe("title placement: drawing", () => {
  const scene = build(LAMP_ABAB, "above");
  const titleCalls = (t: number) => draw(scene, t).texts().filter((c) => c.args[0] === TITLE);

  it("is invisible at the very start, fades in, and is fully opaque for a one-page poem at the end", () => {
    expect(titleCalls(0)).toHaveLength(0);
    const fade = scene.timeline.events.find((e) => e.type === "title")!;
    const mid = titleCalls(fade.start + fade.duration / 2);
    expect(mid).toHaveLength(1);
    expect(mid[0].alpha).toBeGreaterThan(0);
    expect(mid[0].alpha).toBeLessThan(1);
    const end = titleCalls(scene.timeline.totalMs);
    expect(end[0].alpha).toBe(1);
    expect(end[0].fill).toBe(MOOD_PRESETS.Tender.palettes[scene.analysis.paletteVariant].ink);
  });

  it("is drawn at the position the layout computed, in the layout's font", () => {
    const [call] = titleCalls(scene.timeline.totalMs);
    expect(call.args).toEqual([TITLE, scene.layout.title!.x, scene.layout.title!.y]);
    expect(call.font).toBe(scene.layout.title!.font);
  });

  it("appears before the first word", () => {
    const firstWord = scene.timeline.events.find((e) => e.type === "appear")!;
    expect(titleCalls(firstWord.start - 1).length).toBe(1);
    expect(draw(scene, firstWord.start - 1).texts().filter((c) => c.args[0] !== TITLE)).toHaveLength(0);
  });

  it("is not drawn at all when it is in the footer or hidden (the footer is drawn later, in its own style)", () => {
    const hidden = build(LAMP_ABAB, "hidden");
    expect(draw(hidden, hidden.timeline.totalMs).texts().some((c) => c.args[0] === TITLE)).toBe(false);
    const footer = build(LAMP_ABAB, "footer");
    const calls = draw(footer, footer.timeline.totalMs).texts();
    expect(calls[calls.length - 1].args[0]).toBe(TITLE);
    expect(calls[calls.length - 1].alpha).toBeLessThan(1); // the quiet footer
  });

  it("leaves with page 0 on a paged poem", () => {
    const paged = build(FORTY_LINES, "above");
    expect(paged.layout.pages.length).toBeGreaterThan(1);
    const t = paged.layout.title!.text;
    const pageEvent = paged.timeline.events.find((e) => e.type === "page")!;
    const before = draw(paged, pageEvent.start - 1).texts().filter((c) => c.args[0] === t);
    const after = draw(paged, paged.timeline.totalMs).texts().filter((c) => c.args[0] === t);
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(0);
  });

  it("is pure: the same time draws the same frame, and the order of calls does not matter", () => {
    const a = draw(scene, 1500).transcript();
    draw(scene, 9000);
    expect(draw(scene, 1500).transcript()).toBe(a);
  });
});

describe("title placement: every mood", () => {
  it.each(Object.keys(MOOD_PRESETS))("%s draws the title and keeps the poem fully opaque at the end", (id) => {
    const scene = build(LAMP_ABAB, "above", TITLE, { mood: id as MoodPreset["id"], byline: "— me" });
    const ctx = draw(scene, scene.timeline.totalMs);
    const calls = ctx.texts();
    expect(calls.filter((c) => c.args[0] === TITLE)).toHaveLength(1);
    const words = calls.filter((c) => c.args[0] !== TITLE && !scene.layout.footer.some((l) => l.text === c.args[0]));
    expect(words).toHaveLength(scene.layout.pages[0].words.reduce((n, w) => n + w.pieces.length, 0));
    for (const call of words) expect(call.alpha).toBe(1);
  });
});
