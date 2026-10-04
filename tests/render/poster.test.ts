import { describe, expect, it } from "vitest";
import { renderFrame, renderPoster } from "@/lib/render/renderFrame";
import { buildScene, withMark } from "@/lib/render/scene";
import type { Scene } from "@/lib/render/types";
import { LAMP_ABAB } from "../fixtures/poems";
import { monospace, narrowSerif, prepare } from "../helpers";
import { poemCalls, RecordingContext } from "../recorder";

const lines = (count: number, perStanza: number) =>
  Array.from({ length: count }, (_, i) => `the quiet rain keeps falling slow ${i}` + (perStanza && (i + 1) % perStanza === 0 && i < count - 1 ? "\n" : "")).join("\n");

const single = () => {
  const { prosody, analysis } = prepare(LAMP_ABAB);
  return buildScene({ prosody, analysis, title: "A Patient Moon", titlePlacement: "above", byline: "— me", mark: true, format: "reel", measureText: narrowSerif });
};
const paged = () => {
  const { prosody, analysis } = prepare(lines(40, 4));
  return buildScene({ prosody, analysis, title: "Rain", titlePlacement: "above", byline: "— me", mark: true, format: "reel", measureText: monospace });
};
const poster = (scene: Scene, page: number) => {
  const ctx = new RecordingContext();
  renderPoster(ctx.asContext(), scene, page);
  return ctx;
};
const wordsOf = (scene: Scene, page: number) => scene.layout.pages[page].words.flatMap((w) => w.pieces.map((p) => p.text));

describe("renderPoster: the finished poster of one page", () => {
  it("for a one-page poem it IS the final frame of the video", () => {
    const scene = single();
    const final = new RecordingContext();
    renderFrame(final.asContext(), scene, scene.timeline.totalMs);
    expect(poster(scene, 0).transcript()).toBe(final.transcript());
  });

  it("for the last page of a longer poem it is also exactly the final frame", () => {
    const scene = paged();
    expect(scene.layout.pages.length).toBeGreaterThan(1);
    const final = new RecordingContext();
    renderFrame(final.asContext(), scene, scene.timeline.totalMs);
    expect(poster(scene, scene.layout.pages.length - 1).transcript()).toBe(final.transcript());
  });

  it("draws every word of the chosen page, and only those", () => {
    const scene = paged();
    for (let page = 0; page < scene.layout.pages.length; page++) {
      const drawn = poemCalls(poster(scene, page), scene).map((c) => String(c.args[0]));
      expect(drawn.slice().sort()).toEqual(wordsOf(scene, page).slice().sort());
    }
  });

  it("shows each page fully: every word opaque, nothing dimmed", () => {
    const scene = paged();
    for (let page = 0; page < scene.layout.pages.length; page++) {
      for (const call of poemCalls(poster(scene, page), scene)) expect(call.alpha).toBe(1);
    }
  });

  it("the title above the poem belongs to the first page only; the footer and the mark are on every page", () => {
    const scene = paged();
    const last = scene.layout.pages.length - 1;
    const titleDrawn = (page: number) => poster(scene, page).texts().some((c) => c.args[0] === "Rain");
    expect(titleDrawn(0)).toBe(true);
    expect(titleDrawn(1)).toBe(false);
    expect(titleDrawn(last)).toBe(false);
    for (const page of [0, 1, last]) {
      const texts = poster(scene, page).texts();
      expect(texts.some((c) => c.args[0] === "made with Stanza")).toBe(true);
      expect(texts.some((c) => c.args[0] === scene.layout.footer[0].text)).toBe(true);
    }
  });

  it("clamps a page number that does not exist instead of drawing nothing", () => {
    const scene = paged();
    const last = scene.layout.pages.length - 1;
    expect(poster(scene, 99).transcript()).toBe(poster(scene, last).transcript());
    expect(poster(scene, -3).transcript()).toBe(poster(scene, 0).transcript());
  });

  it("is a pure function: the same page twice, the same drawing", () => {
    const scene = paged();
    expect(poster(scene, 1).transcript()).toBe(poster(scene, 1).transcript());
  });

  it("the mark can be toggled on the same scene without touching anything else", () => {
    const scene = paged();
    const off = withMark(scene, false);
    const on = withMark(off, true);
    expect(off.layout).toBe(scene.layout);
    expect(poster(off, 0).texts().some((c) => c.args[0] === "made with Stanza")).toBe(false);
    expect(poster(on, 0).transcript()).toBe(poster(scene, 0).transcript());
    expect(withMark(scene, true)).toBe(scene); // no change, no new object
  });
});
