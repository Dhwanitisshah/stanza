import { describe, expect, it } from "vitest";
import { cubicBezier } from "@/lib/render/easing";
import { entranceAlpha, entranceOffsetY } from "@/lib/render/entrances";
import { grainPixels, hashSeed, mulberry32 } from "@/lib/render/texture";

describe("cubicBezier", () => {
  it("starts at 0, ends at 1, and clamps outside", () => {
    const ease = cubicBezier([0.25, 0.1, 0.25, 1]);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
  });

  it("matches the CSS 'ease' curve at known points", () => {
    const ease = cubicBezier([0.25, 0.1, 0.25, 1]);
    expect(ease(0.5)).toBeCloseTo(0.8024, 3);
  });

  it("is the identity for a straight line", () => {
    const linear = cubicBezier([0, 0, 1, 1]);
    for (const x of [0.1, 0.33, 0.5, 0.9]) expect(linear(x)).toBeCloseTo(x, 4);
  });

  it("never goes backwards for a monotone curve", () => {
    const ease = cubicBezier([0.42, 0, 0.58, 1]);
    let previous = 0;
    for (let i = 0; i <= 100; i++) {
      const y = ease(i / 100);
      expect(y).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = y;
    }
  });
});

describe("entrances", () => {
  it("fade-rise goes from invisible and low to opaque and in place", () => {
    expect(entranceAlpha("fade-rise", 0)).toBe(0);
    expect(entranceAlpha("fade-rise", 1)).toBe(1);
    expect(entranceOffsetY("fade-rise", 0, 100)).toBeGreaterThan(0);
    expect(entranceOffsetY("fade-rise", 1, 100)).toBe(0);
  });
});

describe("paper grain", () => {
  it("is deterministic for the same seed and different for another", () => {
    const a = grainPixels(32, 32, 0.5, 123);
    const b = grainPixels(32, 32, 0.5, 123);
    const c = grainPixels(32, 32, 0.5, 124);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it("is fully transparent at intensity 0 and faint at intensity 1", () => {
    expect(grainPixels(16, 16, 0, 1).every((v) => v === 0)).toBe(true);
    const faint = grainPixels(64, 64, 1, 1);
    let maxAlpha = 0;
    for (let i = 3; i < faint.length; i += 4) maxAlpha = Math.max(maxAlpha, faint[i]);
    expect(maxAlpha).toBeGreaterThan(0);
    expect(maxAlpha).toBeLessThanOrEqual(46);
  });

  it("has the right size (RGBA)", () => {
    expect(grainPixels(10, 7, 0.3, 1)).toHaveLength(10 * 7 * 4);
  });

  it("seeded PRNG repeats and stays in [0, 1)", () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = first();
      expect(v).toBe(second());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(hashSeed("Tender:reel")).toBe(hashSeed("Tender:reel"));
    expect(hashSeed("Tender:reel")).not.toBe(hashSeed("Tender:post"));
  });
});
