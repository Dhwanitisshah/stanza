import { describe, expect, it } from "vitest";
import { clampStrength, drawPattern, MAX_PATTERN_ALPHA, PATTERN_IDS, PATTERN_LABELS, patternAlpha, type PatternId } from "@/lib/render/patterns";
import { PathRecorder } from "../recorder";

const W = 1080;
const H = 1920;
const draw = (id: PatternId, strength = 60, colour = "#33302A", width = W, height = H) => {
  const ctx = new PathRecorder();
  drawPattern(ctx.asContext(), id, width, height, strength, colour);
  return ctx;
};
const DRAWN = PATTERN_IDS.filter((id) => id !== "none");

describe("patterns: the list", () => {
  it("has the eight patterns from the design, each with a label", () => {
    expect([...PATTERN_IDS]).toEqual(["none", "ruled", "notebook", "grid", "dots", "hatch", "frame", "arch"]);
    for (const id of PATTERN_IDS) expect(PATTERN_LABELS[id].length).toBeGreaterThan(0);
  });
});

describe("patterns: deterministic", () => {
  it.each(PATTERN_IDS)("%s draws the same calls every time", (id) => {
    expect(draw(id).transcript()).toBe(draw(id).transcript());
  });

  it.each(PATTERN_IDS)("%s draws the same calls on a fresh context after another pattern was drawn (no hidden state)", (id) => {
    const first = draw(id).transcript();
    draw("grid");
    draw("arch", 100);
    expect(draw(id).transcript()).toBe(first);
  });

  it("does not use randomness or the clock", () => {
    const realRandom = Math.random;
    const realNow = Date.now;
    try {
      Math.random = () => {
        throw new Error("patterns must not use Math.random");
      };
      Date.now = () => {
        throw new Error("patterns must not read the clock");
      };
      for (const id of PATTERN_IDS) expect(() => draw(id)).not.toThrow();
    } finally {
      Math.random = realRandom;
      Date.now = realNow;
    }
  });
});

describe("patterns: what they draw", () => {
  it("none draws nothing at all", () => {
    expect(draw("none").calls).toEqual([]);
  });

  it("strength 0 draws nothing at all", () => {
    for (const id of PATTERN_IDS) expect(draw(id, 0).calls, id).toEqual([]);
  });

  it.each(DRAWN)("%s draws something, and leaves the canvas state as it found it", (id) => {
    const ctx = draw(id);
    expect(ctx.calls.some((c) => c.op === "stroke" || c.op === "fill")).toBe(true);
    expect(ctx.calls.filter((c) => c.op === "save")).toHaveLength(1);
    expect(ctx.calls[ctx.calls.length - 1].op).toBe("restore");
    expect(ctx.globalAlpha).toBe(1);
  });

  it.each(DRAWN)("%s is drawn in the colour it is given (the ink), nothing else", (id) => {
    const ctx = draw(id, 60, "#A1B2C3");
    for (const c of ctx.calls.filter((call) => call.op === "stroke")) expect(c.stroke).toBe("#A1B2C3");
    for (const c of ctx.calls.filter((call) => call.op === "fill")) expect(c.fill).toBe("#A1B2C3");
  });

  it("makes every pattern look different from every other", () => {
    const seen = new Map<string, PatternId>();
    for (const id of DRAWN) {
      const t = draw(id).transcript();
      expect(seen.has(t), `${id} looks like ${seen.get(t)}`).toBe(false);
      seen.set(t, id);
    }
  });

  it("keeps everything inside the canvas (the dots allow for their radius)", () => {
    for (const id of DRAWN) {
      for (const { x, y, pad } of draw(id).points()) {
        if (id !== "hatch") expect(x - pad, `${id} x`).toBeGreaterThanOrEqual(-1e-6);
        expect(y - pad, `${id} y`).toBeGreaterThanOrEqual(-1e-6);
        // Hatch lines start left of the canvas and are clipped to it; everything else stays inside.
        if (id !== "hatch") {
          expect(x + pad, `${id} x`).toBeLessThanOrEqual(W + 1e-6);
          expect(y + pad, `${id} y`).toBeLessThanOrEqual(H + 1e-6);
        }
      }
    }
  });

  it("works at the Post size too", () => {
    for (const id of DRAWN) {
      const ctx = draw(id, 60, "#000000", 1080, 1350);
      expect(ctx.calls.length).toBeGreaterThan(2);
      for (const { y, pad } of ctx.points()) if (id !== "hatch") expect(y + pad).toBeLessThanOrEqual(1350 + 1e-6);
    }
  });

  it("clips hatch lines to the canvas", () => {
    expect(draw("hatch").calls.some((c) => c.op === "clip")).toBe(true);
  });

  it("draws ruled lines across the full width, evenly spaced", () => {
    const ys = draw("ruled")
      .calls.filter((c) => c.op === "moveTo")
      .map((c) => (c.args as number[])[1]);
    expect(ys.length).toBeGreaterThan(10);
    const gaps = new Set(ys.slice(1).map((y, i) => y - ys[i]));
    expect(gaps.size).toBe(1);
    const lineTos = draw("ruled").calls.filter((c) => c.op === "lineTo").map((c) => (c.args as number[])[0]);
    expect(new Set(lineTos)).toEqual(new Set([W]));
  });

  it("notebook is ruled lines plus a vertical margin line", () => {
    const ruled = draw("ruled").calls.filter((c) => c.op === "moveTo").length;
    const notebook = draw("notebook").calls.filter((c) => c.op === "moveTo");
    expect(notebook.length).toBe(ruled + 1);
    const margin = notebook[notebook.length - 1].args as number[];
    expect(margin[0]).toBeGreaterThan(50);
    expect(margin[1]).toBe(0);
  });

  it("grid has both vertical and horizontal lines, dots has many dots, frame is two rectangles, arch is one curve", () => {
    const grid = draw("grid").calls;
    const verticals = grid.filter((c, i) => c.op === "moveTo" && (grid[i + 1].args as number[])[0] === (c.args as number[])[0]).length;
    const horizontals = grid.filter((c, i) => c.op === "moveTo" && (grid[i + 1].args as number[])[1] === (c.args as number[])[1]).length;
    expect(verticals).toBeGreaterThan(10);
    expect(horizontals).toBeGreaterThan(20);
    expect(draw("dots").calls.filter((c) => c.op === "arc").length).toBeGreaterThan(500);
    expect(draw("frame").calls.filter((c) => c.op === "rect")).toHaveLength(2);
    const arch = draw("arch").calls;
    expect(arch.filter((c) => c.op === "arc")).toHaveLength(1);
    expect(arch.filter((c) => c.op === "stroke")).toHaveLength(1);
  });
});

describe("patterns: strength", () => {
  it("maps 0..100 onto how visible the lines are, never above the maximum", () => {
    expect(patternAlpha(0)).toBe(0);
    expect(patternAlpha(100)).toBeCloseTo(MAX_PATTERN_ALPHA);
    expect(patternAlpha(50)).toBeCloseTo(MAX_PATTERN_ALPHA / 2);
    expect(patternAlpha(500)).toBeCloseTo(MAX_PATTERN_ALPHA);
    expect(patternAlpha(-20)).toBe(0);
    expect(patternAlpha(NaN)).toBe(0);
  });

  it("makes a stronger pattern more opaque, and draws the same shapes at any strength", () => {
    const alphaOf = (strength: number) => draw("grid", strength).calls.find((c) => c.op === "stroke")!.alpha;
    expect(alphaOf(20)).toBeLessThan(alphaOf(60));
    expect(alphaOf(60)).toBeLessThan(alphaOf(100));
    const shapes = (strength: number) => draw("grid", strength).calls.filter((c) => c.op === "moveTo" || c.op === "lineTo").map((c) => c.args);
    expect(shapes(20)).toEqual(shapes(100));
  });

  it("clamps strength", () => {
    expect(clampStrength(-5)).toBe(0);
    expect(clampStrength(150)).toBe(100);
    expect(clampStrength(NaN)).toBe(0);
    expect(clampStrength(42)).toBe(42);
  });
});
