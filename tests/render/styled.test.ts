import { describe, expect, it } from "vitest";
import { MOOD_IDS, type MoodId } from "@/lib/moods/ids";
import { MOOD_PRESETS } from "@/lib/moods/presets";
import { buildFrameIndex } from "@/lib/render/frameIndex";
import { PATTERN_IDS } from "@/lib/render/patterns";
import { renderFrame, type FrameResources } from "@/lib/render/renderFrame";
import { buildScene } from "@/lib/render/scene";
import { autoInk, DARK_INK, DEFAULT_STYLING, LIGHT_INK, resolvePalette, type SceneStyling } from "@/lib/render/styling";
import type { Scene } from "@/lib/render/types";
import { buildTimeline } from "@/lib/timeline/buildTimeline";
import { TIMING } from "@/lib/timeline/config";
import { luminance } from "@/lib/moods/contrast";
import { LAMP_ABAB } from "../fixtures/poems";
import { monospace, prepare } from "../helpers";
import { poemCalls, RecordingContext } from "../recorder";

// Opaque stand-ins for the canvases the browser would prepare.
const IMAGE = { tag: "photo" } as unknown as CanvasImageSource;
const GRAIN = { tag: "grain" } as unknown as CanvasImageSource;
const patternResource = (id: string) => ({ tag: `pattern:${id}` }) as unknown as CanvasImageSource;

const styled = (styling: Partial<SceneStyling>, mood: MoodId = "Tender", poem = LAMP_ABAB, emphasis?: string[]): Scene => {
  const { prosody, analysis } = prepare(poem);
  return buildScene({ prosody, analysis: emphasis ? { ...analysis, emphasis } : analysis, mood, title: "A Patient Moon", byline: "me", format: "reel", speed: 1, styling, measureText: monospace });
};
const photo = (darken = 0.35, lum = 0.5): Partial<SceneStyling> => ({ background: { kind: "image", darken, luminance: lum } });

const draw = (scene: Scene, t: number, resources: FrameResources = {}) => {
  const ctx = new RecordingContext();
  renderFrame(ctx.asContext(), scene, t, { index: buildFrameIndex(scene), ...resources });
  return ctx;
};
const ops = (ctx: RecordingContext) => ctx.calls.map((c) => c.op);

describe("styling: drawing order", () => {
  it("goes background, photo, darkening, grain, pattern, then the text", () => {
    const scene = styled({ ...photo(0.4), pattern: { id: "grid", strength: 60 } });
    const pattern = patternResource("grid");
    const ctx = draw(scene, scene.timeline.totalMs, { image: IMAGE, grain: GRAIN, pattern });
    const calls = ctx.calls;
    const at = (predicate: (c: (typeof calls)[number]) => boolean) => calls.findIndex(predicate);

    const background = at((c) => c.op === "fillRect");
    const image = at((c) => c.op === "drawImage" && c.args[0] === IMAGE);
    const darken = at((c, ) => c.op === "fillRect" && c.fill === "#000000");
    const grain = at((c) => c.op === "drawImage" && c.args[0] === GRAIN);
    const patternCall = at((c) => c.op === "drawImage" && c.args[0] === pattern);
    const firstText = at((c) => c.op === "fillText");
    for (const index of [background, image, darken, grain, patternCall, firstText]) expect(index).toBeGreaterThanOrEqual(0);
    expect([background, image, darken, grain, patternCall, firstText]).toEqual([...[background, image, darken, grain, patternCall, firstText]].sort((a, b) => a - b));
    expect(new Set([background, image, darken, grain, patternCall, firstText]).size).toBe(6);
  });

  it("the darkening is a black overlay at the chosen strength, drawn full-canvas, and the alpha is restored", () => {
    const scene = styled(photo(0.4));
    const ctx = draw(scene, 0, { image: IMAGE });
    const overlay = ctx.rects().find((r) => r.fill === "#000000")!;
    expect(overlay.alpha).toBeCloseTo(0.4);
    expect(overlay.args).toEqual([0, 0, scene.layout.width, scene.layout.height]);
    expect(ctx.calls[ctx.calls.indexOf(overlay) + 1].alpha).toBe(1); // the alpha is put back straight after the overlay
  });

  it("draws no darkening at 0, and caps it at 80%", () => {
    expect(draw(styled(photo(0)), 0, { image: IMAGE }).rects().filter((r) => r.fill === "#000000")).toHaveLength(0);
    const capped = draw(styled(photo(5)), 0, { image: IMAGE }).rects().find((r) => r.fill === "#000000")!;
    expect(capped.alpha).toBeCloseTo(0.8);
  });

  it("ignores a photo resource unless the background really is a photo, and never darkens without one", () => {
    const plain = draw(styled({}), 0, { image: IMAGE });
    expect(plain.calls.filter((c) => c.op === "drawImage" && c.args[0] === IMAGE)).toHaveLength(1); // drawn if supplied
    expect(draw(styled(photo(0.5)), 0).calls.some((c) => c.op === "drawImage")).toBe(false); // styling says photo, none supplied
  });

  it("draws the pattern after the grain and before the title and words", () => {
    const scene = styled({ pattern: { id: "ruled", strength: 50 } });
    const pattern = patternResource("ruled");
    const sequence = ops(draw(scene, scene.timeline.totalMs, { grain: GRAIN, pattern }));
    expect(sequence.indexOf("drawImage")).toBeLessThan(sequence.lastIndexOf("drawImage"));
    expect(sequence.lastIndexOf("drawImage")).toBeLessThan(sequence.indexOf("fillText"));
  });
});

describe("styling: colours", () => {
  it("fills the background with the chosen colour and switches the ink automatically", () => {
    const slate = styled({ background: { kind: "colour", colour: "#2E3A4A" } });
    const ctx = draw(slate, slate.timeline.totalMs);
    expect(ctx.rects()[0].fill).toBe("#2E3A4A");
    const words = poemCalls(ctx, slate);
    expect(words.filter((c) => c.fill === LIGHT_INK).length).toBeGreaterThan(0);
    expect(words.some((c) => c.fill === MOOD_PRESETS.Tender.palettes[0].ink)).toBe(false);

    const cream = styled({ background: { kind: "colour", colour: "#F5EFE2" } }, "Reverent");
    expect(poemCalls(draw(cream, cream.timeline.totalMs), cream).some((c) => c.fill === DARK_INK)).toBe(true);
  });

  it("chooses the ink for a photo from its brightness after darkening", () => {
    const dark = styled(photo(0, 0.1));
    expect(poemCalls(draw(dark, dark.timeline.totalMs, { image: IMAGE }), dark).some((c) => c.fill === LIGHT_INK)).toBe(true);
    const bright = styled(photo(0, 0.85));
    expect(poemCalls(draw(bright, bright.timeline.totalMs, { image: IMAGE }), bright).some((c) => c.fill === DARK_INK)).toBe(true);
    const brightButDarkened = styled(photo(0.8, 0.85));
    expect(poemCalls(draw(brightButDarkened, brightButDarkened.timeline.totalMs, { image: IMAGE }), brightButDarkened).some((c) => c.fill === LIGHT_INK)).toBe(true);
  });

  it("draws the title and the footer in the automatic ink too", () => {
    const { prosody, analysis } = prepare(LAMP_ABAB);
    const slate = buildScene({
      prosody,
      analysis,
      mood: "Tender",
      title: "A Patient Moon",
      titlePlacement: "above",
      byline: "me",
      format: "reel",
      speed: 1,
      styling: { background: { kind: "colour", colour: "#16171A" } },
      measureText: monospace,
    });
    const ctx = draw(slate, slate.timeline.totalMs);
    const title = slate.layout.title ? ctx.texts().filter((c) => c.font === slate.layout.title!.font) : [];
    expect(title.length).toBeGreaterThan(0);
    for (const call of title) expect(call.fill).toBe(LIGHT_INK);
    const footer = ctx.texts().filter((c) => c.font === slate.layout.footer[slate.layout.footer.length - 1].font);
    expect(footer.at(-1)!.fill).toBe(LIGHT_INK);
  });

  it("colours a line the user chose, and only that line", () => {
    const scene = styled({ lineColours: { 1: "#C0392B" } });
    const ctx = draw(scene, scene.timeline.totalMs);
    const line1 = new Set(scene.layout.pages[0].words.filter((w) => w.lineIndex === 1 && !w.emphasized).flatMap((w) => w.pieces.map((p) => `${p.text}|${p.x}`)));
    const palette = MOOD_PRESETS.Tender.palettes[scene.analysis.paletteVariant];
    for (const call of poemCalls(ctx, scene)) {
      const key = `${call.args[0]}|${call.args[1]}`;
      if (line1.has(key)) expect(call.fill, key).toBe("#C0392B");
      else if (call.font === scene.layout.font) expect(call.fill, key).toBe(palette.ink);
    }
    expect(line1.size).toBeGreaterThan(0);
  });

  it("lets an emphasised word keep its emphasis colour even on a coloured line", () => {
    const { prosody } = prepare(LAMP_ABAB);
    const word = prosody.stanzas[0].lines[1].words[3]; // "quiet"
    const scene = styled({ lineColours: { 1: "#C0392B" } }, "Tender", LAMP_ABAB, [word.id]);
    const calls = poemCalls(draw(scene, scene.timeline.totalMs), scene);
    const emphasised = calls.find((c) => c.font === scene.layout.emphasisFont)!;
    expect(emphasised.fill).toBe(MOOD_PRESETS.Tender.palettes[scene.analysis.paletteVariant].accent);
  });

  it("uses the emphasis colour the user picked (text and underline)", () => {
    const tender = styled({ emphasisColour: "#E8B84A" });
    const calls = poemCalls(draw(tender, tender.timeline.totalMs), tender);
    expect(calls.find((c) => c.font === tender.layout.emphasisFont)!.fill).toBe("#E8B84A");

    const melancholy = styled({ emphasisColour: "#E8B84A" }, "Melancholy");
    expect(draw(melancholy, melancholy.timeline.totalMs).rects().some((r) => r.fill === "#E8B84A")).toBe(true); // the underline
  });

  it("a highlighter takes the chosen colour as its bar, and its text stays readable on it", () => {
    const yellow = styled({}, "Restless");
    expect(luminance(buildFrameIndex(yellow).highlightFill)).toBeGreaterThan(0.5);
    expect(poemCalls(draw(yellow, yellow.timeline.totalMs), yellow).find((c) => c.font === yellow.layout.emphasisFont)!.fill).toBe(DARK_INK);

    const navy = styled({ emphasisColour: "#1F3A6B" }, "Restless");
    const ctx = draw(navy, navy.timeline.totalMs);
    expect(ctx.rects().some((r) => r.fill === "#1F3A6B")).toBe(true); // the bar
    expect(poemCalls(ctx, navy).find((c) => c.font === navy.layout.emphasisFont)!.fill).toBe(LIGHT_INK); // light text on the dark bar
  });

  it("keeps a highlighter's text dark even on a dark background (it sits on the yellow bar, not the paper)", () => {
    const dark = styled({ background: { kind: "colour", colour: "#16171A" } }, "Restless");
    const calls = poemCalls(draw(dark, dark.timeline.totalMs), dark);
    expect(calls.find((c) => c.font === dark.layout.emphasisFont)!.fill).toBe(DARK_INK);
    expect(calls.find((c) => c.font === dark.layout.font)!.fill).toBe(LIGHT_INK); // the rest of the poem is light
  });

  it("is the mood's own look when no styling is given", () => {
    const { prosody, analysis } = prepare(LAMP_ABAB);
    const plain = buildScene({ prosody, analysis, mood: "Tender", format: "reel", speed: 1, measureText: monospace });
    expect(plain.styling).toEqual(DEFAULT_STYLING);
    expect(buildFrameIndex(plain).background).toBe(resolvePalette(MOOD_PRESETS.Tender, analysis.paletteVariant).background);
  });
});

describe("styling: purity with a photo and every pattern, in every mood", () => {
  const resources = (id: string): FrameResources => ({ image: IMAGE, grain: GRAIN, pattern: patternResource(id) });

  describe.each(MOOD_IDS)("%s", (mood) => {
    it.each(PATTERN_IDS)("same t twice, and 5000 -> 12000 -> 5000, with a photo and the %s pattern", (pattern) => {
      const scene = styled({ ...photo(0.4), pattern: { id: pattern, strength: 70 }, lineColours: { 0: "#C0392B" }, emphasisColour: "#E8B84A" }, mood);
      const r = resources(pattern);
      const frame = (t: number) => draw(scene, t, r).transcript();
      const first = frame(5000);
      expect(frame(5000)).toBe(first);
      expect(frame(12000)).not.toBe(first);
      expect(frame(5000)).toBe(first);
    });

    it("draws every word at full opacity at totalMs with a photo, a pattern and custom colours", () => {
      const scene = styled({ ...photo(0.5), pattern: { id: "grid", strength: 50 }, lineColours: { 2: "#C0392B" } }, mood);
      const ctx = draw(scene, scene.timeline.totalMs, resources("grid"));
      const words = poemCalls(ctx, scene);
      const expected = scene.layout.pages[0].words.flatMap((w) => w.pieces.map((p) => p.text));
      expect(words.map((c) => c.args[0])).toEqual(expected);
      for (const call of words) expect(call.alpha).toBe(1);
    });

    it("clamps t and keeps the canvas state balanced", () => {
      const scene = styled({ ...photo(0.4), pattern: { id: "dots", strength: 40 } }, mood);
      const r = resources("dots");
      expect(draw(scene, -50, r).transcript()).toBe(draw(scene, 0, r).transcript());
      expect(draw(scene, scene.timeline.totalMs + 9999, r).transcript()).toBe(draw(scene, scene.timeline.totalMs, r).transcript());
      const ctx = draw(scene, 6000, r);
      expect(ctx.calls.filter((c) => c.op === "save")).toHaveLength(ctx.calls.filter((c) => c.op === "restore").length);
      expect(ctx.globalAlpha).toBe(1);
    });
  });

  it("has no hidden state when a context is reused across different styles", () => {
    const a = styled({ ...photo(0.4), pattern: { id: "grid", strength: 70 } }, "Reverent");
    const b = styled({ background: { kind: "colour", colour: "#C9D3C3" } }, "Restless");
    const ctx = new RecordingContext();
    const marks = [0];
    for (const [scene, t, r] of [[a, 6000, resources("grid")], [b, 9000, {}], [a, 6000, resources("grid")]] as const) {
      renderFrame(ctx.asContext(), scene, t, { index: buildFrameIndex(scene), ...r });
      marks.push(ctx.calls.length);
    }
    const frame = (i: number) => JSON.stringify(ctx.calls.slice(marks[i], marks[i + 1]));
    expect(frame(2)).toBe(frame(0));
  });
});

describe("important words", () => {
  const { prosody, analysis } = prepare(LAMP_ABAB);
  const ids = prosody.stanzas.flatMap((s) => s.lines.flatMap((l) => l.words.map((w) => w.id)));
  const total = (emphasis: string[]) => buildTimeline(prosody, { emphasis }, MOOD_PRESETS.Tender, 1).totalMs;
  const hold = Math.round(TIMING.emphasisHoldBeats * MOOD_PRESETS.Tender.beatMs);

  it("replace the AI's pick: only the words the user marked are emphasised", () => {
    const scene = styled({}, "Tender", LAMP_ABAB, [ids[0], ids[5]]);
    expect(scene.layout.pages[0].words.filter((w) => w.emphasized).map((w) => w.wordId)).toEqual([ids[0], ids[5]]);
    expect(analysis.emphasis).not.toEqual([ids[0], ids[5]]); // so this really is a replacement
  });

  it("change how long the poem takes: each marked word holds a beat and a half longer", () => {
    expect(total([ids[0]]) - total([])).toBe(hold);
    expect(total([ids[0], ids[5], ids[9]]) - total([])).toBe(3 * hold);
    expect(total([])).toBeLessThan(total(analysis.emphasis.length ? analysis.emphasis : [ids[3]]));
  });

  it("show up in the scene's length too (and the length control sees them)", () => {
    const none = styled({}, "Tender", LAMP_ABAB, []);
    const three = styled({}, "Tender", LAMP_ABAB, [ids[0], ids[5], ids[9]]);
    expect(three.timeline.totalMs - none.timeline.totalMs).toBe(3 * hold);
    expect(three.length.minMs).toBeGreaterThan(none.length.minMs);
  });

  it("marking no words at all is allowed: no emphasis, no extra hold", () => {
    const scene = styled({}, "Tender", LAMP_ABAB, []);
    expect(scene.layout.pages[0].words.some((w) => w.emphasized)).toBe(false);
    expect(scene.timeline.events.some((e) => e.type === "appear" && e.isEmphasis)).toBe(false);
  });

  it("a word's colour follows the colour the user picked, through the frame index", () => {
    const scene = styled({ emphasisColour: "#E8B84A" }, "Tender", LAMP_ABAB, [ids[1]]);
    const index = buildFrameIndex(scene);
    expect(index.words.filter((w) => w.emphasized).map((w) => w.fill)).toEqual(["#E8B84A"]);
    expect(autoInk(0.5)).toBeTypeOf("string");
  });
});
