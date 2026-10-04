import { describe, expect, it } from "vitest";
import { comparePixels } from "../../scripts/lib/pixels.mjs";

const flat = (r: number, g: number, b: number, pixels = 100) => Uint8ClampedArray.from(Array.from({ length: pixels }, () => [r, g, b, 255]).flat());

describe("comparePixels (the metric the export check uses)", () => {
  it("identical images: no difference, PSNR capped at 99 dB", () => {
    expect(comparePixels(flat(10, 20, 30), flat(10, 20, 30))).toEqual({ mad: 0, mse: 0, psnr: 99 });
  });

  it("measures the mean absolute difference per colour channel", () => {
    // Red is off by 30 everywhere, green and blue are exact: the mean over three channels is 10.
    expect(comparePixels(flat(100, 50, 50), flat(130, 50, 50)).mad).toBeCloseTo(10, 10);
  });

  it("PSNR matches the textbook formula: every channel off by 10 gives 10 * log10(255^2 / 100) = 28.13 dB", () => {
    const { psnr, mse } = comparePixels(flat(100, 100, 100), flat(110, 110, 110));
    expect(mse).toBeCloseTo(100, 10);
    expect(psnr).toBeCloseTo(28.1308, 3);
  });

  it("a bigger error means a lower PSNR", () => {
    const base = flat(100, 100, 100);
    expect(comparePixels(base, flat(105, 105, 105)).psnr).toBeGreaterThan(comparePixels(base, flat(140, 140, 140)).psnr);
  });

  it("ignores alpha, and is symmetric", () => {
    const a = flat(1, 2, 3);
    const b = flat(1, 2, 3);
    for (let i = 3; i < b.length; i += 4) b[i] = 0;
    expect(comparePixels(a, b).mse).toBe(0);
    expect(comparePixels(flat(0, 0, 0), flat(9, 9, 9)).psnr).toBeCloseTo(comparePixels(flat(9, 9, 9), flat(0, 0, 0)).psnr, 10);
  });

  it("refuses images of different sizes instead of comparing the wrong things", () => {
    expect(() => comparePixels(flat(0, 0, 0, 10), flat(0, 0, 0, 11))).toThrow(/same size/);
  });

  it("survives being injected into a page as source text (no outside variables)", () => {
    const rebuilt = new Function(`return (${comparePixels.toString()})`)() as typeof comparePixels;
    expect(rebuilt(flat(100, 100, 100), flat(110, 110, 110)).psnr).toBeCloseTo(28.1308, 3);
  });
});
