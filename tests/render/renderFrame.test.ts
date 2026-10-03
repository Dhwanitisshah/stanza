import { describe, expect, it } from "vitest";
import { MOOD_IDS, type MoodId } from "@/lib/moods/ids";
import { MOOD_PRESETS, TENDER } from "@/lib/moods/presets";
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

/** The poem's own text calls: the footer (title, byline) is drawn after the words, so it is filtered out. */
const body = (ctx: RecordingContext, scene: Scene) => {
  const footer = new Set(scene.layout.footer.map((line) => `${line.text}|${line.x}`));
  return ctx.texts().filter((call) => !footer.has(`${call.args[0]}|${call.args[1]}`));
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
    const texts = body(ctx, lamp);
    expect(texts.map((c) => c.args[0])).toEqual(textsOf(lamp, 0)); // each word once, in order, no echo overlays
    for (const call of texts) expect(call.alpha).toBe(1);
  });

  it("draws every word fully opaque in a multi-stanza poem: dims have been restored", () => {
    const texts = body(draw(twoStanzas, twoStanzas.timeline.totalMs), twoStanzas);
    expect(texts).toHaveLength(textsOf(twoStanzas, 0).length);
    for (const call of texts) expect(call.alpha).toBe(1);
  });

  it("shows only the last page at totalMs, fully opaque, for a paged poem", () => {
    expect(paged.layout.pages.length).toBeGreaterThan(1);
    const last = paged.layout.pages.length - 1;
    const texts = body(draw(paged, paged.timeline.totalMs), paged);
    expect(texts.map((c) => c.args[0])).toEqual(textsOf(paged, last));
    for (const call of texts) expect(call.alpha).toBe(1);
  });

  it("draws at the exact positions the layout computed, on the baseline", () => {
    const [first] = draw(lamp, lamp.timeline.totalMs).texts();
    const piece = lamp.layout.pages[0].words[0].pieces[0];
    expect(first.args).toEqual([piece.text, piece.x, piece.y + lamp.layout.baseline]);
  });

  it("uses the emphasis font and colour for emphasised words, and the base font otherwise", () => {
    const texts = body(draw(lamp, lamp.timeline.totalMs), lamp);
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
    const drawn = body(draw(paged, t), paged).length;
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

describe("renderFrame: the footer (title and byline)", () => {
  const withByline = (poem: string, byline?: string) => {
    const { prosody, analysis } = prepare(poem);
    return buildScene({ prosody, analysis, byline, format: "reel", speed: 1, measureText: monospace });
  };
  const scene = withByline(LAMP_ABAB, "\u2014 Dhwanit");

  it("is invisible while the poem is still being performed", () => {
    const lastAppear = scene.timeline.events.filter((e) => e.type === "appear").pop()!;
    const before = draw(scene, lastAppear.start + lastAppear.duration).texts();
    expect(before.map((c) => c.args[0])).not.toContain(scene.layout.footer[0].text);
  });

  it("fades in during the final hold and is quiet (never full strength)", () => {
    const footerEvent = scene.timeline.events.find((e) => e.type === "footer")!;
    const lastAppear = scene.timeline.events.filter((e) => e.type === "appear").pop()!;
    expect(footerEvent.start).toBeGreaterThan(lastAppear.start + lastAppear.duration - 1);
    expect(footerEvent.start + footerEvent.duration).toBeLessThanOrEqual(scene.timeline.totalMs);

    const footerCalls = (t: number) => draw(scene, t).texts().filter((c) => scene.layout.footer.some((l) => l.text === c.args[0]));
    expect(footerCalls(footerEvent.start - 1)).toHaveLength(0);
    const mid = footerCalls(footerEvent.start + footerEvent.duration / 2);
    const end = footerCalls(scene.timeline.totalMs);
    expect(mid).toHaveLength(2);
    expect(mid[0].alpha).toBeGreaterThan(0);
    expect(mid[0].alpha).toBeLessThan(end[0].alpha);
    expect(end[0].alpha).toBeGreaterThan(0.3);
    expect(end[0].alpha).toBeLessThan(1);
  });

  it("draws the title above the byline, inside the safe area, using the footer font", () => {
    const [title, byline] = scene.layout.footer;
    expect(title.text).toBe(scene.analysis.title);
    expect(byline.text).toBe("\u2014 Dhwanit");
    expect(title.y).toBeLessThan(byline.y);
    const safe = scene.layout.safeArea;
    for (const line of scene.layout.footer) {
      expect(line.x).toBeGreaterThanOrEqual(safe.x);
      expect(line.y).toBeLessThanOrEqual(safe.y + safe.height);
    }
    const calls = draw(scene, scene.timeline.totalMs).texts();
    expect(calls[calls.length - 1].font).toBe(byline.font);
    expect(calls[calls.length - 2].font).toBe(title.font);
  });

  it("keeps the poem above the footer strip", () => {
    const lowestWord = Math.max(...scene.layout.pages.flatMap((p) => p.words.map((w) => w.box.y + w.box.height)));
    expect(lowestWord).toBeLessThanOrEqual(scene.layout.footer[0].y);
  });

  it("shows only the title when there is no byline, and nothing for an empty title", () => {
    expect(withByline(LAMP_ABAB).layout.footer).toHaveLength(1);
    expect(withByline(LAMP_ABAB, "   ").layout.footer).toHaveLength(1);
    const { prosody, analysis } = prepare(LAMP_ABAB);
    const untitled = buildScene({ prosody, analysis: { ...analysis, title: "" }, format: "reel", speed: 1, measureText: monospace });
    expect(untitled.layout.footer).toHaveLength(0);
    expect(draw(untitled, untitled.timeline.totalMs).texts()).toHaveLength(textsOf(untitled, 0).length);
  });

  it("does not change the poem's own layout when a byline is added", () => {
    const plain = withByline(LAMP_ABAB);
    expect(withByline(LAMP_ABAB, "\u2014 someone").layout.pages).toEqual(plain.layout.pages);
    expect(withByline(LAMP_ABAB, "\u2014 someone").layout.fontSize).toBe(plain.layout.fontSize);
  });

  it("shrinks, then shortens, a title that is too long", () => {
    const { prosody, analysis } = prepare(LAMP_ABAB);
    const long = "word ".repeat(60).trim();
    const built = buildScene({ prosody, analysis: { ...analysis, title: long }, format: "reel", speed: 1, measureText: monospace });
    const [line] = built.layout.footer;
    const safe = built.layout.safeArea;
    expect(monospace(line.text, line.font)).toBeLessThanOrEqual(safe.width + 1e-6);
    expect(line.text.endsWith("\u2026")).toBe(true);
  });

  it("is uppercase for moods that ask for it", () => {
    const { prosody, analysis } = prepare(LAMP_ABAB);
    const defiant = buildScene({ prosody, analysis, mood: "Defiant", byline: "\u2014 me", format: "reel", speed: 1, measureText: monospace });
    expect(defiant.layout.footer.map((l) => l.text)).toEqual([analysis.title.toUpperCase(), "\u2014 ME"]);
  });
});

describe("renderFrame: all six moods", () => {
  const POEMS: Record<string, string> = { lamp: LAMP_ABAB, twoStanzas: "the lamp burns low\nthe kettle hums\n\nthe rain has found\nthe wooden floor", forty: fortyLines };
  const moodScene = (poem: string, id: MoodId, format: FormatId = "reel") => {
    const { prosody, analysis } = prepare(poem);
    return buildScene({ prosody, analysis, mood: id, byline: "\u2014 me", format, speed: 1, measureText: monospace });
  };

  describe.each(MOOD_IDS)("%s", (id) => {
    const scene = moodScene(LAMP_ABAB, id);

    it("draws the same thing for the same t, and has no hidden state (5000, 12000, 5000)", () => {
      const first = draw(scene, 5000).transcript();
      const middle = draw(scene, 12000).transcript();
      expect(draw(scene, 5000).transcript()).toBe(first);
      expect(middle).not.toBe(first);
      expect(draw(scene, 5000).transcript()).toBe(first);
    });

    it("keeps hidden state out even across many scrubs and with a reused context", () => {
      const ctx = new RecordingContext();
      const marks = [0];
      for (const t of [200, 9000, 3500, 9000, 200, 14000, 3500]) {
        renderFrame(ctx.asContext(), scene, t);
        marks.push(ctx.calls.length);
      }
      const frame = (i: number) => JSON.stringify(ctx.calls.slice(marks[i], marks[i + 1]));
      expect(frame(1)).toBe(frame(3)); // 9000 twice
      expect(frame(0)).toBe(frame(4)); // 200 twice
      expect(frame(2)).toBe(frame(6)); // 3500 twice
    });

    it("clamps t below 0 and above totalMs", () => {
      expect(draw(scene, -999).transcript()).toBe(draw(scene, 0).transcript());
      expect(draw(scene, scene.timeline.totalMs + 99999).transcript()).toBe(draw(scene, scene.timeline.totalMs).transcript());
    });

    it("draws every word at full opacity, exactly once, at totalMs", () => {
      for (const [name, poem] of Object.entries(POEMS)) {
        const built = moodScene(poem, id);
        const ctx = draw(built, built.timeline.totalMs);
        const last = built.layout.pages.length - 1;
        const expected = built.layout.pages[last].words.flatMap((w) => w.pieces.map((p) => p.text));
        const texts = body(ctx, built);
        expect(texts.map((c) => c.args[0]), name).toEqual(expected);
        for (const call of texts) expect(call.alpha, name).toBe(1);
        for (const call of texts) expect(call.shadowBlur, name).toBe(0); // at rest: no leftover blur or glow
      }
    });

    it("draws nothing but the background before the first word", () => {
      expect(draw(scene, 100).texts()).toHaveLength(0);
    });

    it("never draws outside the canvas or with a bad alpha, at any moment", () => {
      for (let t = 0; t <= scene.timeline.totalMs; t += 337) {
        for (const call of draw(scene, t).calls) {
          expect(call.alpha).toBeGreaterThanOrEqual(0);
          expect(call.alpha).toBeLessThanOrEqual(1);
          expect(Number.isFinite(call.shadowBlur) && call.shadowBlur >= 0).toBe(true);
          if (call.op === "fillText") {
            expect(Number.isFinite(call.args[1] as number) && Number.isFinite(call.args[2] as number)).toBe(true);
          }
        }
      }
    });

    it("uses the mood's palette and its fonts", () => {
      const preset = MOOD_PRESETS[id];
      const palette = preset.palettes[scene.analysis.paletteVariant];
      const bg = draw(scene, 0).calls.find((c) => c.op === "fillRect")!;
      expect(bg.fill).toBe(palette.background);
      const final = body(draw(scene, scene.timeline.totalMs), scene);
      expect(final.some((c) => c.fill === palette.ink)).toBe(true);
      for (const call of final) expect([scene.layout.font, scene.layout.emphasisFont]).toContain(call.font);
    });

    it("finishes with the footer drawn last", () => {
      const texts = draw(scene, scene.timeline.totalMs).texts();
      expect(texts.slice(-2).map((c) => c.args[0])).toEqual(scene.layout.footer.map((l) => l.text));
    });
  });
});

describe("renderFrame: per-mood drawing techniques", () => {
  const moodScene = (id: MoodId) => {
    const { prosody, analysis } = prepare(LAMP_ABAB);
    return buildScene({ prosody, analysis, mood: id, format: "reel", speed: 1, measureText: monospace });
  };
  const firstAppear = (scene: Scene) => scene.timeline.events.find((e) => e.type === "appear")!;

  it("typewriter (Restless) shows the first characters of a word before the rest", () => {
    const scene = moodScene("Restless");
    const first = firstAppear(scene);
    const word = scene.layout.pages[0].words[0].pieces[0].text; // "The"
    const seen = new Set<string>();
    for (let dt = 0; dt <= 400; dt += 10) for (const c of draw(scene, first.start + dt).texts()) seen.add(String(c.args[0]));
    expect(seen.has(word)).toBe(true);
    expect([...seen].some((text) => text.length > 0 && text.length < word.length && word.startsWith(text))).toBe(true);
  });

  it("typewriter draws prefixes taken from a precomputed table (no string building per frame)", () => {
    const index = buildFrameIndex(moodScene("Restless"));
    expect(index.words[0].prefixes).not.toBeNull();
    expect(index.words[0].prefixes![0]).toEqual(["", "T", "Th", "The"]);
    expect(buildFrameIndex(moodScene("Tender")).words[0].prefixes).toBeNull();
  });

  it("slam (Defiant) starts bigger and uses a scale transform, which is gone at rest", () => {
    const scene = moodScene("Defiant");
    const start = firstAppear(scene).start;
    const during = draw(scene, start + 60);
    expect(during.calls.some((c) => c.op === "scale" && (c.args[0] as number) > 1)).toBe(true);
    expect(draw(scene, scene.timeline.totalMs).calls.some((c) => c.op === "scale")).toBe(false);
  });

  it("ink-bleed (Reverent) fakes blur with shadowBlur and an offset shadow, never ctx.filter", () => {
    const scene = moodScene("Reverent");
    const start = firstAppear(scene).start;
    const ctx = draw(scene, start + 120);
    const ghost = ctx.texts().find((c) => c.shadowBlur > 0);
    expect(ghost).toBeDefined();
    expect(ghost!.shadowOffsetX).toBeGreaterThan(1000); // the glyph itself is off-canvas; only its shadow shows
    expect(ghost!.args[1] as number).toBeLessThan(0);
    expect("filter" in ctx).toBe(false);
    // Blur falls away as the word lands.
    // Look at the first word only: later words are still blurring while it settles.
    const firstWord = scene.layout.pages[0].words[0].pieces[0].text;
    const blurAt = (dt: number) => Math.max(0, ...draw(scene, start + dt).texts().filter((c) => c.args[0] === firstWord).map((c) => c.shadowBlur));
    expect(blurAt(60)).toBeGreaterThan(blurAt(500));
    expect(blurAt(1200)).toBe(0);
  });

  it("drift (Melancholy) settles downward", () => {
    const scene = moodScene("Melancholy");
    const start = firstAppear(scene).start;
    const early = draw(scene, start + 100).texts()[0];
    const done = draw(scene, start + 3000).texts()[0];
    expect(early.args[2] as number).toBeLessThan(done.args[2] as number);
  });

  it("highlighter (Restless) paints a bar behind an emphasised word, before its text", () => {
    const scene = moodScene("Restless");
    const ctx = draw(scene, scene.timeline.totalMs);
    const accent = MOOD_PRESETS.Restless.palettes[scene.analysis.paletteVariant].accent;
    const bars = ctx.rects().filter((r) => r.fill === accent);
    expect(bars.length).toBe(scene.analysis.emphasis.length);
    const barPosition = ctx.calls.indexOf(bars[0]);
    const emphasisedText = ctx.calls.findIndex((c, i) => i > barPosition && c.op === "fillText" && c.font === scene.layout.emphasisFont);
    expect(barPosition).toBeLessThan(emphasisedText);
  });

  it("underline emphasis (Melancholy) draws itself: it grows as the word lands", () => {
    const scene = moodScene("Melancholy");
    const emphasised = scene.analysis.emphasis[0];
    const start = (scene.timeline.events.find((e) => e.type === "appear" && e.wordId === emphasised) as { start: number }).start;
    const widthAt = (dt: number) => draw(scene, start + dt).rects().filter((r) => r.fill === MOOD_PRESETS.Melancholy.palettes[scene.analysis.paletteVariant].accent).map((r) => r.args[2] as number);
    expect(widthAt(100)[0]).toBeLessThan(widthAt(900)[0]);
  });

  it("each echo style looks different: pulse recolours, underline links both words, glow uses shadow", () => {
    const echoFrame = (id: MoodId) => {
      const scene = moodScene(id);
      const echo = scene.timeline.events.find((e) => e.type === "echo")!;
      return { scene, ctx: draw(scene, echo.start + echo.duration / 2) };
    };
    const pulse = echoFrame("Tender");
    const glow = echoFrame("Joyful");
    const link = echoFrame("Melancholy");

    const echoColour = (scene: Scene, id: MoodId) => MOOD_PRESETS[id].palettes[scene.analysis.paletteVariant][MOOD_PRESETS[id].echo.color]!;
    expect(pulse.ctx.texts().some((c) => c.fill === echoColour(pulse.scene, "Tender") && c.shadowBlur === 0)).toBe(true);
    expect(glow.ctx.texts().some((c) => c.fill === echoColour(glow.scene, "Joyful") && c.shadowBlur > 0)).toBe(true);
    const underlines = link.ctx.rects().filter((r) => r.fill === echoColour(link.scene, "Melancholy"));
    expect(underlines.length).toBeGreaterThanOrEqual(2); // one under each rhyme partner
    expect(link.ctx.texts().some((c) => c.fill === echoColour(link.scene, "Melancholy"))).toBe(false);
  });

  it("an echo leaves no glow or shadow behind once it ends", () => {
    const scene = moodScene("Joyful");
    const echo = scene.timeline.events.find((e) => e.type === "echo")!;
    const after = draw(scene, echo.start + echo.duration + 50);
    for (const call of after.texts()) expect(call.shadowBlur).toBe(0);
  });
});
