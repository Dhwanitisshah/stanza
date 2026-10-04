import { describe, expect, it } from "vitest";
import { MOOD_IDS } from "@/lib/moods/ids";
import { MARK_SIZE, MARK_TEXT } from "@/lib/render/fonts";
import { MARK_ALPHA } from "@/lib/render/frameIndex";
import { renderFrame } from "@/lib/render/renderFrame";
import { buildScene } from "@/lib/render/scene";
import type { FormatId, Scene } from "@/lib/render/types";
import { LAMP_ABAB } from "../fixtures/poems";
import { narrowSerif, prepare } from "../helpers";
import { RecordingContext } from "../recorder";

const build = (patch: { mark?: boolean; format?: FormatId; mood?: (typeof MOOD_IDS)[number]; title?: string; byline?: string } = {}) => {
  const { prosody, analysis } = prepare(LAMP_ABAB);
  return buildScene({ prosody, analysis, title: patch.title ?? "A Patient Moon", titlePlacement: "footer", byline: patch.byline ?? "— me", format: patch.format ?? "reel", mood: patch.mood, mark: patch.mark, measureText: narrowSerif });
};
const draw = (scene: Scene, t: number) => {
  const ctx = new RecordingContext();
  renderFrame(ctx.asContext(), scene, t);
  return ctx;
};
const markCalls = (ctx: RecordingContext) => ctx.texts().filter((c) => c.args[0] === MARK_TEXT);

describe("the made-with-Stanza mark: drawing", () => {
  it("is off by default in the engine, and drawn exactly once per frame when on", () => {
    expect(markCalls(draw(build(), 5000))).toHaveLength(0);
    expect(markCalls(draw(build({ mark: false }), 5000))).toHaveLength(0);
    expect(markCalls(draw(build({ mark: true }), 5000))).toHaveLength(1);
  });

  it("is there from the first frame to the last, identical each time (it never animates)", () => {
    const scene = build({ mark: true });
    const total = scene.timeline.totalMs;
    const seen = [0, 1, total / 3, total / 2, total - 1, total].map((t) => markCalls(draw(scene, t)));
    for (const calls of seen) {
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual(seen[0][0]);
    }
  });

  it("is quiet: low alpha, right-aligned at the safe area's right edge, in the poster's own ink", () => {
    const scene = build({ mark: true });
    const [call] = markCalls(draw(scene, scene.timeline.totalMs));
    expect(call.alpha).toBe(MARK_ALPHA);
    expect(MARK_ALPHA).toBeLessThanOrEqual(0.5);
    expect(call.textAlign).toBe("right");
    expect(call.args[1]).toBe(scene.layout.safeArea.x + scene.layout.safeArea.width);
    expect(call.args[2]).toBe(scene.layout.mark.y);
    expect(call.font).toBe(scene.layout.mark.font);
    expect(call.font).toContain(`${MARK_SIZE}px`);
  });

  it("leaves the drawing state as it found it (textAlign must not leak into the next frame)", () => {
    const ctx = new RecordingContext();
    ctx.textAlign = "center";
    renderFrame(ctx.asContext(), build({ mark: true }), 100);
    expect(ctx.textAlign).toBe("center");
    expect(ctx.globalAlpha).toBe(1);
  });

  it("is a pure function of time: the same frame twice gives the same drawing", () => {
    const scene = build({ mark: true });
    expect(draw(scene, 4321).transcript()).toBe(draw(scene, 4321).transcript());
  });
});

describe("the made-with-Stanza mark: placement", () => {
  const cases = MOOD_IDS.flatMap((mood) => (["reel", "post"] as const).map((format) => ({ mood, format })));

  it.each(cases)("$mood $format: inside the canvas, below the poem and clear of the footer", ({ mood, format }) => {
    const scene = build({ mood, format, mark: true, byline: "— a rather long byline to fill the strip, as a stress test" });
    const { mark, footer, safeArea, height, width } = scene.layout;
    const markTop = mark.y - MARK_SIZE * 0.85; // cap height of an italic serif is below 0.85 em
    const footerBottom = Math.max(...footer.map((line) => line.y)) + 28 * 0.3; // descenders of the largest footer size

    expect(mark.x).toBe(safeArea.x + safeArea.width);
    expect(mark.x).toBeLessThan(width);
    expect(mark.y).toBeLessThan(height);
    expect(markTop).toBeGreaterThanOrEqual(footerBottom + 8); // never touching the footer
    if (format === "reel") expect(mark.y).toBeLessThanOrEqual(safeArea.y + safeArea.height); // inside the Instagram-safe area
    else expect(height - mark.y).toBeGreaterThanOrEqual(32); // clear of the edge
    for (const page of scene.layout.pages) for (const word of page.words) expect(word.box.y + word.box.height).toBeLessThanOrEqual(footer[0].y);
  });

  it("the mark's width fits the safe area, so it never runs off the left (measured in every mood)", () => {
    for (const mood of MOOD_IDS) {
      const { layout } = build({ mood, mark: true });
      expect(narrowSerif(MARK_TEXT, layout.mark.font)).toBeLessThan(layout.safeArea.width / 3);
    }
  });

  it("switching the mark on or off changes nothing else: same layout, same timeline", () => {
    const on = build({ mark: true });
    const off = build({ mark: false });
    expect(on.layout).toEqual(off.layout);
    expect(on.timeline).toEqual(off.timeline);
  });
});
