import { describe, expect, it } from "vitest";
import { BAR_HEIGHT, barIndexAtTime, edgeTime, rhythmBars, seekTimeForFraction, stepWord, stressLevel, type RhythmBar } from "@/lib/render/rhythm";
import { buildScene } from "@/lib/render/scene";
import { LAMP_ABAB } from "../fixtures/poems";
import { monospace, prepare } from "../helpers";

const sceneOf = (poem: string) => {
  const { prosody, analysis } = prepare(poem);
  return buildScene({ prosody, analysis, format: "reel", speed: 1, measureText: monospace });
};
const scene = sceneOf(LAMP_ABAB);
const bars = rhythmBars(scene);

describe("rhythm bars", () => {
  it("has one bar per word, in time order, with the timeline's own start and duration", () => {
    const appears = scene.timeline.events.filter((e) => e.type === "appear");
    expect(bars).toHaveLength(appears.length);
    expect(bars).toHaveLength(scene.prosody.wordCount);
    bars.forEach((bar, i) => {
      expect(bar.start).toBe(appears[i].start);
      expect(bar.duration).toBe(appears[i].duration);
      if (i > 0) expect(bar.start).toBeGreaterThan(bars[i - 1].start);
    });
  });

  it("places bars as fractions of the timeline, inside 0..1, and leaves gaps where the poem rests", () => {
    for (const bar of bars) {
      expect(bar.x).toBeGreaterThanOrEqual(0);
      expect(bar.x + bar.width).toBeLessThanOrEqual(1);
      expect(bar.x).toBeCloseTo(bar.start / scene.timeline.totalMs, 10);
    }
    // "door," is followed by a comma and a line break: a visible gap before the next bar.
    const door = scene.prosody.stanzas[0].lines[0].words.length - 1;
    expect(bars[door + 1].x - (bars[door].x + bars[door].width)).toBeGreaterThan(0);
  });

  it("makes height follow stress: stressed tall, unstressed short", () => {
    const words = scene.prosody.stanzas.flatMap((s) => s.lines.flatMap((l) => l.words));
    const the = bars[words.findIndex((w) => w.core === "The")];
    const lamp = bars[words.findIndex((w) => w.core === "lamp")];
    expect(the.level).toBe("unstressed");
    expect(lamp.level).toBe("stressed");
    expect(lamp.height).toBeGreaterThan(the.height);
    expect(lamp.height).toBe(BAR_HEIGHT.stressed);
  });

  it("marks the emphasised words and gives them the widest bars (the hold is part of their duration)", () => {
    const flagged = bars.filter((b) => b.emphasis);
    expect(flagged.map((b) => b.wordId)).toEqual(scene.analysis.emphasis);
    expect(flagged.length).toBeGreaterThan(0);
    const sameWord = bars.find((b) => !b.emphasis && b.level === flagged[0].level)!;
    expect(flagged[0].duration).toBeGreaterThan(sameWord.duration);
  });

  it("reads stress levels from the stress string", () => {
    expect(stressLevel("1")).toBe("stressed");
    expect(stressLevel("102")).toBe("stressed");
    expect(stressLevel("01")).toBe("stressed");
    expect(stressLevel("02")).toBe("secondary");
    expect(stressLevel("0")).toBe("unstressed");
    expect(stressLevel("")).toBe("unstressed");
  });

  it("is deterministic and copes with an empty poem", () => {
    expect(rhythmBars(scene)).toEqual(bars);
    expect(rhythmBars(sceneOf(""))).toEqual([]);
  });
});

describe("rhythm strip: seeking", () => {
  it("clicking a bar seeks to that word's landing", () => {
    for (const bar of bars) {
      expect(seekTimeForFraction(bars, bar.x + bar.width / 2)).toBe(bar.start);
      expect(seekTimeForFraction(bars, bar.x)).toBe(bar.start);
    }
  });

  it("clicking a gap seeks to the nearest bar", () => {
    const [a, b] = [bars[6], bars[7]]; // across the line break after "door,"
    const gapStart = a.x + a.width;
    expect(b.x - gapStart).toBeGreaterThan(0);
    expect(seekTimeForFraction(bars, gapStart + (b.x - gapStart) * 0.1)).toBe(a.start);
    expect(seekTimeForFraction(bars, gapStart + (b.x - gapStart) * 0.9)).toBe(b.start);
  });

  it("clamps clicks outside the strip and ignores NaN", () => {
    expect(seekTimeForFraction(bars, -3)).toBe(bars[0].start);
    expect(seekTimeForFraction(bars, 7)).toBe(bars[bars.length - 1].start);
    expect(seekTimeForFraction(bars, NaN)).toBe(bars[0].start);
    expect(seekTimeForFraction([], 0.5)).toBeNull();
  });

  it("finds which word has landed at a given time", () => {
    expect(barIndexAtTime(bars, 0)).toBe(-1); // lead-in
    expect(barIndexAtTime(bars, bars[0].start)).toBe(0);
    expect(barIndexAtTime(bars, bars[3].start + 1)).toBe(3);
    expect(barIndexAtTime(bars, bars[3].start - 1)).toBe(2);
    expect(barIndexAtTime(bars, 1e9)).toBe(bars.length - 1);
    expect(barIndexAtTime([], 5)).toBe(-1);
  });

  it("agrees with seeking: after seeking to a bar, that bar is the current word", () => {
    for (let i = 0; i < bars.length; i++) expect(barIndexAtTime(bars, seekTimeForFraction(bars, bars[i].x)!)).toBe(i);
  });
});

describe("rhythm strip: keyboard", () => {
  it("steps word by word with the arrow keys", () => {
    expect(stepWord(bars, bars[3].start, 1)).toBe(bars[4].start);
    expect(stepWord(bars, bars[3].start, -1)).toBe(bars[2].start);
  });

  it("from between words, forward goes to the next landing and back to the previous one", () => {
    const between = bars[3].start + 5;
    expect(stepWord(bars, between, 1)).toBe(bars[4].start);
    expect(stepWord(bars, between, -1)).toBe(bars[3].start);
  });

  it("stays at the ends instead of going nowhere", () => {
    expect(stepWord(bars, bars[bars.length - 1].start, 1)).toBe(bars[bars.length - 1].start);
    expect(stepWord(bars, bars[0].start, -1)).toBe(bars[0].start);
    expect(stepWord(bars, 0, -1)).toBe(bars[0].start);
    expect(stepWord([], 0, 1)).toBeNull();
  });

  it("walking forward visits every word exactly once", () => {
    const visited: number[] = [];
    let t = 0;
    for (let guard = 0; guard < bars.length + 5; guard++) {
      const next = stepWord(bars, t, 1)!;
      if (next === t) break;
      visited.push(next);
      t = next;
    }
    expect(visited).toEqual(bars.map((b) => b.start));
  });

  it("Home and End go to the first and last landing", () => {
    expect(edgeTime(bars, "start")).toBe(bars[0].start);
    expect(edgeTime(bars, "end")).toBe(bars[bars.length - 1].start);
    expect(edgeTime([] as RhythmBar[], "end")).toBeNull();
  });
});
