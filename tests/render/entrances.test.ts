import { describe, expect, it } from "vitest";
import type { EntranceStyle } from "@/lib/moods/types";
import { ENTRANCE_MS, entranceState, INK_BLEED_BLUR_EM, newEntranceState } from "@/lib/render/entrances";

const STYLES: EntranceStyle[] = ["fade-rise", "typewriter", "ink-bleed", "slam", "drift"];
const SIZE = 80;
const CHARS = 7;

const state = (style: EntranceStyle, progress: number) => ({ ...entranceState(style, progress, SIZE, CHARS) });
const invisible = (s: ReturnType<typeof state>) => s.opacity === 0 || s.visibleChars === 0;

describe("entrances", () => {
  it.each(STYLES)("%s: progress 0 is invisible", (style) => {
    expect(invisible(state(style, 0))).toBe(true);
  });

  it.each(STYLES)("%s: progress 1 is exactly at rest (identity transform, full opacity, every character)", (style) => {
    const rest = state(style, 1);
    expect(rest.opacity).toBe(1);
    expect(rest.dx).toBe(0);
    expect(rest.dy).toBe(0);
    expect(rest.scale).toBe(1);
    expect(rest.blur).toBe(0);
    expect(rest.visibleChars).toBe(CHARS);
    // Object.is(-0, 0) is false: rest must be a clean zero, not negative zero.
    expect(Object.is(rest.dy, 0)).toBe(true);
    expect(Object.is(rest.dx, 0)).toBe(true);
  });

  it.each(STYLES)("%s: only ever uses sane values for any progress in 0..1", (style) => {
    for (let i = 0; i <= 100; i++) {
      const s = state(style, i / 100);
      expect(s.opacity).toBeGreaterThanOrEqual(0);
      expect(s.opacity).toBeLessThanOrEqual(1);
      expect(s.blur).toBeGreaterThanOrEqual(0);
      expect(s.scale).toBeGreaterThan(0);
      expect(s.visibleChars).toBeGreaterThanOrEqual(0);
      expect(s.visibleChars).toBeLessThanOrEqual(CHARS);
      expect(Number.isFinite(s.dy)).toBe(true);
    }
  });

  it.each(STYLES)("%s: opacity and visible characters never go backwards as progress grows", (style) => {
    let previous = state(style, 0);
    for (let i = 1; i <= 100; i++) {
      const s = state(style, i / 100);
      expect(s.opacity).toBeGreaterThanOrEqual(previous.opacity - 1e-12);
      expect(s.visibleChars).toBeGreaterThanOrEqual(previous.visibleChars);
      previous = s;
    }
  });

  it.each(STYLES)("%s: stays well defined when an overshooting easing pushes progress past 1 or below 0", (style) => {
    for (const p of [-0.2, 1.1, 1.25]) {
      const s = state(style, p);
      expect(Number.isFinite(s.dy) && Number.isFinite(s.scale) && Number.isFinite(s.blur)).toBe(true);
      expect(s.opacity).toBeGreaterThanOrEqual(0);
      expect(s.opacity).toBeLessThanOrEqual(1);
      expect(s.blur).toBeGreaterThanOrEqual(0);
    }
  });

  it("fade-rise rises: starts below its place and fades in", () => {
    expect(state("fade-rise", 0.3).dy).toBeGreaterThan(0);
    expect(state("fade-rise", 0.3).opacity).toBeCloseTo(0.3);
  });

  it("drift settles downward: starts above its place", () => {
    expect(state("drift", 0.3).dy).toBeLessThan(0);
    expect(state("drift", 0.3).opacity).toBeGreaterThan(0);
  });

  it("slam starts big and becomes visible quickly", () => {
    expect(state("slam", 0).scale).toBeCloseTo(1.3);
    expect(state("slam", 0.25).opacity).toBe(1);
    expect(state("slam", 0.5).scale).toBeLessThan(1.3);
  });

  it("ink-bleed goes from blurred to sharp, and the blur is bounded by the font size", () => {
    expect(state("ink-bleed", 0).blur).toBeCloseTo(SIZE * INK_BLEED_BLUR_EM);
    expect(state("ink-bleed", 0.5).blur).toBeLessThan(state("ink-bleed", 0.1).blur);
    expect(state("ink-bleed", 1).blur).toBe(0);
  });

  it("typewriter reveals one character at a time", () => {
    const counts = Array.from({ length: 101 }, (_, i) => state("typewriter", i / 100).visibleChars);
    expect(new Set(counts)).toEqual(new Set(Array.from({ length: CHARS + 1 }, (_, n) => n)));
    expect(state("typewriter", 0.5).visibleChars).toBe(3); // floor(0.5 * 7)
  });

  it("fills and returns the object it is given (no allocation in the frame loop)", () => {
    const out = newEntranceState();
    expect(entranceState("slam", 0.4, SIZE, CHARS, out)).toBe(out);
    expect(out.scale).toBeGreaterThan(1);
  });

  it("every style has a duration", () => {
    for (const style of STYLES) expect(ENTRANCE_MS[style]).toBeGreaterThan(0);
  });
});
