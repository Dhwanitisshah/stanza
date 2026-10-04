import { describe, expect, it } from "vitest";
import { EXPORT_FPS, frameDurationUs, frameTimes, frameTimestampUs, isKeyFrame } from "@/lib/export/frameTimes";
import { renderFrame } from "@/lib/render/renderFrame";
import { buildScene } from "@/lib/render/scene";
import { LAMP_ABAB } from "../fixtures/poems";
import { narrowSerif, prepare } from "../helpers";
import { RecordingContext } from "../recorder";

describe("frameTimes: count", () => {
  it("is ceil(totalMs * fps / 1000): the video lasts at least the poem and less than one frame longer", () => {
    for (const [totalMs, count] of [
      [14600, 438],
      [15000, 450],
      [15001, 451],
      [7000, 210],
      [33, 1],
      [34, 2],
    ] as const) {
      expect(frameTimes(totalMs, 30)).toHaveLength(count);
    }
  });

  it("the duration N / fps is within one frame of totalMs, for many lengths and frame rates", () => {
    for (const fps of [24, 25, 30, 60]) {
      for (let totalMs = 100; totalMs <= 90_000; totalMs += 997) {
        const n = frameTimes(totalMs, fps).length;
        const duration = (n * 1000) / fps;
        expect(duration, `${totalMs} ms at ${fps} fps`).toBeGreaterThanOrEqual(totalMs - 1e-6);
        expect(duration, `${totalMs} ms at ${fps} fps`).toBeLessThan(totalMs + 1000 / fps + 1e-6);
      }
    }
  });
});

describe("frameTimes: no drift", () => {
  it("frame i is at exactly i * 1000 / fps (computed from the number, not by adding up steps)", () => {
    const times = frameTimes(600_000, 30); // ten minutes: 18,000 frames
    for (const i of [0, 1, 2, 3, 299, 450, 900, 5000, 17_998]) expect(times[i]).toBe((i * 1000) / 30);
    expect(times[450]).toBe(15000);
    expect(times[1800]).toBe(60000);
  });

  it("a running sum of 1000/30 would have drifted by now; ours has not", () => {
    let running = 0;
    for (let i = 0; i < 18_000; i++) running += 1000 / 30;
    const times = frameTimes(600_000, 30);
    expect(Math.abs(running - times[17_999])).toBeGreaterThan(0); // the naive way is off...
    expect(times[17_999]).toBe(600_000); // ...ours is exact where it matters: the last frame
    expect(Math.abs(times[17_000] - 566_666.6666666666)).toBeLessThan(1e-6);
  });

  it("is strictly increasing and never later than the end", () => {
    for (const totalMs of [1, 33, 1234, 14_600, 61_000]) {
      const times = frameTimes(totalMs, 30);
      for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
      expect(Math.max(...times)).toBeLessThanOrEqual(totalMs);
    }
  });

  it("every step is one frame, except the last, which can be up to two (the poster is holding still)", () => {
    const times = frameTimes(14_600, 30);
    for (let i = 1; i < times.length - 1; i++) expect(times[i] - times[i - 1]).toBeCloseTo(1000 / 30, 9);
    const last = times[times.length - 1] - times[times.length - 2];
    expect(last).toBeGreaterThan(1000 / 30 - 1e-9);
    expect(last).toBeLessThanOrEqual(2000 / 30 + 1e-9);
  });
});

describe("frameTimes: the last frame is the poster", () => {
  it("starts at 0 and ends at exactly totalMs", () => {
    for (const totalMs of [14_600, 15_000, 7_001, 61_234]) {
      const times = frameTimes(totalMs, 30);
      expect(times[0]).toBe(0);
      expect(times[times.length - 1]).toBe(totalMs);
    }
  });

  it("drawing at the last time gives exactly the final frame of the preview", () => {
    const { prosody, analysis } = prepare(LAMP_ABAB);
    const scene = buildScene({ prosody, analysis, title: "A Patient Moon", byline: "— me", mark: true, format: "reel", measureText: narrowSerif });
    const times = frameTimes(scene.timeline.totalMs, EXPORT_FPS);
    const draw = (t: number) => {
      const ctx = new RecordingContext();
      renderFrame(ctx.asContext(), scene, t);
      return ctx.transcript();
    };
    expect(draw(times[times.length - 1])).toBe(draw(scene.timeline.totalMs));
    // and the footer and mark are in, which a frame a few ms earlier might not have finished fading
    const lastCalls = new RecordingContext();
    renderFrame(lastCalls.asContext(), scene, times[times.length - 1]);
    expect(lastCalls.texts().some((c) => c.args[0] === "made with Stanza")).toBe(true);
  });
});

describe("frameTimes: edge cases", () => {
  it("a zero, negative or broken length is one frame at 0", () => {
    for (const totalMs of [0, -5, NaN, Infinity]) expect(frameTimes(totalMs, 30)).toEqual([0]);
  });

  it("a one-frame poem is that single frame, at the end", () => {
    expect(frameTimes(20, 30)).toEqual([20]);
  });

  it("refuses a nonsense frame rate", () => {
    for (const fps of [0, -1, NaN]) expect(() => frameTimes(1000, fps)).toThrow(RangeError);
  });
});

describe("timestamps and key frames", () => {
  it("timestamps come from the frame number: frame 30 is at exactly one second", () => {
    expect(frameTimestampUs(0)).toBe(0);
    expect(frameTimestampUs(30)).toBe(1_000_000);
    expect(frameTimestampUs(450)).toBe(15_000_000);
    expect(frameTimestampUs(18_000)).toBe(600_000_000);
  });

  it("neighbouring timestamps are 33333 or 33334 microseconds apart, and never stray from the exact value", () => {
    for (let i = 1; i < 2000; i++) {
      const step = frameTimestampUs(i) - frameTimestampUs(i - 1);
      expect([33_333, 33_334]).toContain(step);
      expect(Math.abs(frameTimestampUs(i) - (i * 1_000_000) / 30)).toBeLessThanOrEqual(0.5);
    }
  });

  it("a frame lasts a thirtieth of a second", () => {
    expect(frameDurationUs(30)).toBe(33_333);
  });

  it("a key frame every 2 seconds: frame 0, 60, 120...", () => {
    const keys = Array.from({ length: 200 }, (_, i) => i).filter((i) => isKeyFrame(i, 30));
    expect(keys).toEqual([0, 60, 120, 180]);
    expect(isKeyFrame(60, 60)).toBe(false); // at 60 fps the interval is 120 frames
    expect(isKeyFrame(120, 60)).toBe(true);
  });
});
