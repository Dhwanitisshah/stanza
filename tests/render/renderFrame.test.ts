import { describe, expect, it } from "vitest";
import { TENDER } from "@/lib/moods/presets";
import { buildFrameIndex, RESTORE_MS } from "@/lib/render/frameIndex";
import { renderFrame, clampTime, type FrameResources } from "@/lib/render/renderFrame";
import { buildScene } from "@/lib/render/scene";
import type { FormatId, Scene } from "@/lib/render/types";
import { TIMING } from "@/lib/timeline/config";
import { LAMP_ABAB } from "../fixtures/poems";
import { monospace, prepare } from "../helpers";
import { RecordingContext } from "../recorder";

const sceneOf = (poem: string, format: FormatId = "reel"): Scene => {
  const { prosody, analysis } = prepare(poem);
  return buildScene({ prosody, analysis, format, speed: 1, measureText: monospace });
};

const draw = (scene: Scene, t: number, resources?: FrameResources) => {
  const ctx = new RecordingContext();
  renderFrame(ctx.asContext(), scene, t, resources);
  return ctx;
};

const lamp = sceneOf(LAMP_ABAB);
const fortyLines = Array.from({ length: 40 }, (_, i) => `the quiet rain keeps falling slow ${i}` + (i % 4 === 3 ? "\n" : "")).join("\n");
const paged = sceneOf(fortyLines);
const twoStanzas = sceneOf("the lamp burns low\nthe kettle hums\n\nthe rain has found\nthe wooden floor");

const wordsOnPage = (scene: Scene, page: number) => scene.layout.pages[page].words;
const textsOf = (scene: Scene, page: number) => wordsOnPage(scene, page).flatMap((w) => w.pieces.map((p) => p.text));

describe("renderFrame: purity", () => {
  it("draws the same thing for the same t", () => {
    for (const t of [0, 700, 5000, 12000, lamp.timeline.totalMs]) {
      expect(draw(lamp, t).transcript()).toBe(draw(lamp, t).transcript());
    }
  });

  it("has no hidden state: t=5000, then t=12000, then t=5000 again", () => {
    const first = draw(lamp, 5000).transcript();
    const middle = draw(lamp, 12000).transcript();
    const last = draw(lamp, 5000).transcript();
    expect(middle).not.toBe(first);
    expect(last).toBe(first);
  });

  it("has no hidden state even when one context is reused across calls", () => {
    const ctx = new RecordingContext();
    const marks = [0];
    for (const t of [5000, 12000, 5000]) {
      renderFrame(ctx.asContext(), lamp, t);
      marks.push(ctx.calls.length);
    }
    const [first, , third] = [0, 1, 2].map((i) => JSON.stringify(ctx.calls.slice(marks[i], marks[i + 1])));
    expect(third).toBe(first);
  });

  it("gives the same frames with a prebuilt index as without one", () => {
    const resources = { index: buildFrameIndex(lamp) };
    for (const t of [900, 6000, 15000]) expect(draw(lamp, t, resources).transcript()).toBe(draw(lamp, t).transcript());
  });

  it("does not depend on the clock or on randomness", () => {
    const realNow = Date.now;
    const realRandom = Math.random;
    try {
      Date.now = () => {
        throw new Error("renderFrame must not read the clock");
      };
      Math.random = () => {
        throw new Error("renderFrame must not use Math.random");
      };
      expect(() => draw(lamp, 8000)).not.toThrow();
    } finally {
      Date.now = realNow;
      Math.random = realRandom;
    }
  });

  it("leaves the canvas state as it found it (save/restore balanced, alpha reset)", () => {
    const ctx = draw(lamp, 8000);
    expect(ctx.calls.filter((c) => c.op === "save")).toHaveLength(1);
    expect(ctx.calls.filter((c) => c.op === "restore")).toHaveLength(1);
    expect(ctx.calls[ctx.calls.length - 1].op).toBe("restore");
  });
});

describe("renderFrame: clamping", () => {
  const total = lamp.timeline.totalMs;

  it("clamps t below 0 to 0 and above totalMs to totalMs", () => {
    expect(draw(lamp, -500).transcript()).toBe(draw(lamp, 0).transcript());
    expect(draw(lamp, -Infinity).transcript()).toBe(draw(lamp, 0).transcript());
    expect(draw(lamp, total + 10_000).transcript()).toBe(draw(lamp, total).transcript());
    expect(draw(lamp, Infinity).transcript()).toBe(draw(lamp, 0).transcript()); // not finite: treated as 0
    expect(draw(lamp, NaN).transcript()).toBe(draw(lamp, 0).transcript());
  });

  it("clampTime", () => {
    expect(clampTime(-1, 100)).toBe(0);
    expect(clampTime(50, 100)).toBe(50);
    expect(clampTime(101, 100)).toBe(100);
  });
});

describe("renderFrame: the final frame is the poster", () => {
  it("draws every word of a one-page poem at full opacity, once, at totalMs", () => {
    const ctx = draw(lamp, lamp.timeline.totalMs);
    const texts = ctx.texts();
    expect(texts.map((c) => c.args[0])).toEqual(textsOf(lamp, 0)); // each word once, in order, no echo overlays
    for (const call of texts) expect(call.alpha).toBe(1);
  });

  it("draws every word fully opaque in a multi-stanza poem: dims have been restored", () => {
    const texts = draw(twoStanzas, twoStanzas.timeline.totalMs).texts();
    expect(texts).toHaveLength(textsOf(twoStanzas, 0).length);
    for (const call of texts) expect(call.alpha).toBe(1);
  });

  it("shows only the last page at totalMs, fully opaque, for a paged poem", () => {
    expect(paged.layout.pages.length).toBeGreaterThan(1);
    const last = paged.layout.pages.length - 1;
    const texts = draw(paged, paged.timeline.totalMs).texts();
    expect(texts.map((c) => c.args[0])).toEqual(textsOf(paged, last));
    for (const call of texts) expect(call.alpha).toBe(1);
  });

  it("draws at the exact positions the layout computed, on the baseline", () => {
    const [first] = draw(lamp, lamp.timeline.totalMs).texts();
    const piece = lamp.layout.pages[0].words[0].pieces[0];
    expect(first.args).toEqual([piece.text, piece.x, piece.y + lamp.layout.baseline]);
  });

  it("uses the emphasis font and colour for emphasised words, and the base font otherwise", () => {
    const texts = draw(lamp, lamp.timeline.totalMs).texts();
    const words = lamp.layout.pages[0].words;
    texts.forEach((call, i) => {
      expect(call.font).toBe(words[i].emphasized ? lamp.layout.emphasisFont : lamp.layout.font);
    });
    expect(words.some((w) => w.emphasized)).toBe(true);
    const palette = TENDER.palettes[lamp.analysis.paletteVariant];
    expect(texts.find((_, i) => words[i].emphasized)?.fill).toBe(palette.accent);
    expect(texts.find((_, i) => !words[i].emphasized)?.fill).toBe(palette.ink);
  });
});

describe("renderFrame: drawing order and entrances", () => {
  it("paints the background first, then the grain, then words", () => {
    const grain = { fake: "image" } as unknown as CanvasImageSource;
    const ctx = draw(lamp, lamp.timeline.totalMs, { grain });
    const ops = ctx.calls.map((c) => c.op);
    expect(ops.slice(0, 4)).toEqual(["save", "fillRect", "drawImage", "fillText"]);
    expect(ctx.calls[1].args).toEqual([0, 0, lamp.layout.width, lamp.layout.height]);
    expect(ctx.calls[1].fill).toBe(TENDER.palettes[lamp.analysis.paletteVariant].background);
  });

  it("draws only the background before the first word", () => {
    const ctx = draw(lamp, 100);
    expect(ctx.texts()).toHaveLength(0);
    expect(ctx.calls.some((c) => c.op === "fillRect")).toBe(true);
  });

  it("fades a word in and lifts it into place (fade-rise)", () => {
    const start = lamp.timeline.events.find((e) => e.type === "appear")!.start;
    const early = draw(lamp, start + 100).texts()[0];
    const later = draw(lamp, start + 300).texts()[0];
    const done = draw(lamp, start + 5000).texts()[0];
    expect(early.alpha).toBeGreaterThan(0);
    expect(early.alpha).toBeLessThan(later.alpha);
    expect(later.alpha).toBeLessThan(1);
    expect(done.alpha).toBe(1);
    // Still rising: lower on screen (bigger y) than its final place.
    expect(early.args[2] as number).toBeGreaterThan(done.args[2] as number);
    expect(later.args[2] as number).toBeGreaterThan(done.args[2] as number);
    expect(later.args[2] as number).toBeLessThan(early.args[2] as number);
  });

  it("reveals words in poem order as time passes", () => {
    // Distinct words only: echo overlays redraw a word, which is not a new word.
    const counts = [1000, 4000, 8000, 12000, 20000].map(
      (t) => new Set(draw(lamp, t).texts().map((c) => `${c.args[0]}@${c.args[1]},${c.args[2]}`)).size,
    );
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts[0]).toBeLessThan(counts[counts.length - 1]);
  });
});

describe("renderFrame: stanza dim", () => {
  const dim = twoStanzas.timeline.events.find((e) => e.type === "stanza-dim")!;
  const firstStanzaLength = twoStanzas.layout.pages[0].words.filter((w) => w.stanzaIndex === 0).reduce((n, w) => n + w.pieces.length, 0);

  it("dims the finished stanza to about 35% while the poem continues", () => {
    const at = dim.start + dim.duration + 100; // dim complete, next stanza not finished
    const texts = draw(twoStanzas, at).texts();
    const first = texts.slice(0, firstStanzaLength);
    for (const call of first) expect(call.alpha).toBeCloseTo(TIMING.stanzaDimTo, 5);
  });

  it("fades the dim in over its duration", () => {
    const mid = draw(twoStanzas, dim.start + dim.duration / 2).texts()[0];
    expect(mid.alpha).toBeGreaterThan(TIMING.stanzaDimTo);
    expect(mid.alpha).toBeLessThan(1);
  });

  it("restores full strength during the final hold, ending at exactly 1", () => {
    const lastAppear = twoStanzas.timeline.events.filter((e) => e.type === "appear").pop()!;
    const restoreStart = lastAppear.start + lastAppear.duration;
    const mid = draw(twoStanzas, restoreStart + RESTORE_MS / 2).texts()[0];
    expect(mid.alpha).toBeGreaterThan(TIMING.stanzaDimTo);
    expect(mid.alpha).toBeLessThan(1);
    expect(draw(twoStanzas, restoreStart + RESTORE_MS).texts()[0].alpha).toBe(1);
  });
});

describe("renderFrame: rhyme echoes", () => {
  const overlays = (scene: Scene, t: number) => {
    const accent2 = TENDER.palettes[scene.analysis.paletteVariant].accent2;
    const accent = TENDER.palettes[scene.analysis.paletteVariant].accent;
    return draw(scene, t)
      .texts()
      .filter((c) => c.fill === accent || c.fill === accent2);
  };
  const echoOf = (scene: Scene) => scene.timeline.events.find((e) => e.type === "echo")!;

  it("pulses the earlier rhyme word in an accent colour when the later one lands, then stops", () => {
    const echo = echoOf(lamp);
    const base = draw(lamp, echo.start - 1).texts().length;
    const during = draw(lamp, echo.start + echo.duration / 2).texts();
    expect(during.length).toBe(draw(lamp, echo.start + echo.duration / 2 - 1).texts().length); // stable
    expect(during.length).toBeGreaterThan(base);
    const after = draw(lamp, echo.start + echo.duration + 1).texts();
    expect(after.length).toBeLessThan(during.length + 1);
    expect(overlays(lamp, echo.start + echo.duration / 2).length).toBeGreaterThan(0);
  });

  it("pulses in and out: strongest in the middle, nothing at the edges", () => {
    const echo = echoOf(lamp);
    const countAt = (t: number) => draw(lamp, t).texts().length;
    const before = countAt(echo.start - 1);
    expect(countAt(echo.start)).toBe(before); // pulse is 0 at its very start
    expect(countAt(echo.start + echo.duration / 2)).toBeGreaterThan(before);
    expect(countAt(echo.start + echo.duration)).toBeLessThanOrEqual(countAt(echo.start + echo.duration / 2));
  });

  it("is softer for near rhymes than for perfect rhymes", () => {
    const near = sceneOf("I watched the passing time\nAnd wished that you were mine");
    const perfect = sceneOf("I watched the passing door\nAnd wished that you were floor");
    const peak = (scene: Scene) => {
      const echo = echoOf(scene);
      const accent2 = TENDER.palettes[scene.analysis.paletteVariant].accent2;
      const overlay = draw(scene, echo.start + echo.duration / 2).texts().filter((c) => c.fill === accent2);
      expect(overlay).toHaveLength(1);
      return overlay[0].alpha;
    };
    expect(echoOf(near)).toMatchObject({ strength: "near" });
    expect(echoOf(perfect)).toMatchObject({ strength: "perfect" });
    expect(peak(near)).toBeLessThan(peak(perfect));
  });
});

describe("renderFrame: page crossfade", () => {
  const page = paged.timeline.events.find((e) => e.type === "page")!;

  it("fades the old page out and shows nothing of the new page until its words appear", () => {
    const before = draw(paged, page.start - 1).texts();
    const mid = draw(paged, page.start + page.duration / 2).texts();
    const afterTransition = draw(paged, page.start + page.duration).texts();

    expect(before.length).toBeGreaterThan(0);
    expect(mid.length).toBeGreaterThan(0);
    for (const call of mid) expect(call.alpha).toBeLessThan(1);
    expect(mid[0].alpha).toBeGreaterThan(0);
    const textsOfPage0 = new Set(textsOf(paged, 0));
    for (const call of afterTransition) expect(textsOfPage0.has(call.args[0] as string)).toBe(false); // old page is gone
  });

  it("draws a page's words only on that page", () => {
    const t = paged.timeline.totalMs;
    const drawn = draw(paged, t).texts().length;
    expect(drawn).toBe(wordsOnPage(paged, paged.layout.pages.length - 1).reduce((n, w) => n + w.pieces.length, 0));
  });
});

describe("frame index", () => {
  it("is deterministic and covers every word in drawing order", () => {
    // `ease` is a fresh closure each time, so compare everything else.
    expect({ ...buildFrameIndex(lamp), ease: 0 }).toEqual({ ...buildFrameIndex(lamp), ease: 0 });
    const ease = buildFrameIndex(lamp).ease;
    expect([0, 0.25, 0.5, 0.75, 1].map(ease)).toEqual([0, 0.25, 0.5, 0.75, 1].map(buildFrameIndex(lamp).ease));
    expect(buildFrameIndex(lamp).words).toHaveLength(lamp.layout.pages[0].words.length);
    expect(buildFrameIndex(lamp).words.every((w) => Number.isFinite(w.appearStart))).toBe(true);
  });

  it("falls back to palette variant 0 for out-of-range variants", () => {
    const scene = { ...lamp, analysis: { ...lamp.analysis, paletteVariant: 99 } };
    expect(buildFrameIndex(scene).background).toBe(TENDER.palettes[2].background);
    expect(buildFrameIndex({ ...lamp, analysis: { ...lamp.analysis, paletteVariant: NaN } }).background).toBe(TENDER.palettes[0].background);
  });
});
