import { describe, expect, it } from "vitest";
import { MOOD_PRESETS, TENDER } from "@/lib/moods/presets";
import { buildTimeline } from "@/lib/timeline/buildTimeline";
import { TIMING } from "@/lib/timeline/config";
import { speedForDuration } from "@/lib/timeline/speedForDuration";
import { AABB, ABAB, FORTY_LINES, FREE_VERSE, LAMP_ABAB, LETTERS_AABB, TRAFFIC_FREE_VERSE } from "../fixtures/poems";
import { prepare } from "../helpers";

const POEMS: Record<string, string> = { lamp: LAMP_ABAB, aabb: LETTERS_AABB, traffic: TRAFFIC_FREE_VERSE, wordsworth: ABAB, blake: AABB, whitman: FREE_VERSE, forty: FORTY_LINES };
const solve = (poem: string, target: number | null, mood = TENDER, context = {}) => {
  const { prosody, analysis } = prepare(poem);
  return { prosody, analysis, solution: speedForDuration(prosody, analysis, mood, target, context) };
};
const totalAt = (poem: string, speed: number, extraHoldMs = 0, mood = TENDER, options = {}, pageOfLine?: number[]) => {
  const { prosody, analysis } = prepare(poem);
  return buildTimeline(prosody, analysis, mood, speed, pageOfLine, { ...options, extraHoldMs }).totalMs;
};

describe("speedForDuration: Auto", () => {
  it("is speed 1 with no extra hold, and reports the real duration", () => {
    const { solution } = solve(LAMP_ABAB, null);
    expect(solution).toMatchObject({ mode: "auto", speed: 1, extraHoldMs: 0, targetMs: null, reachable: true });
    expect(solution.totalMs).toBe(totalAt(LAMP_ABAB, 1));
  });

  it("treats a non-finite target as Auto", () => {
    expect(solve(LAMP_ABAB, NaN).solution.mode).toBe("auto");
    expect(solve(LAMP_ABAB, Infinity).solution.mode).toBe("auto");
  });
});

describe("speedForDuration: hitting a target", () => {
  it.each(Object.keys(POEMS))("%s: lands within 100 ms of every reachable target", (name) => {
    const poem = POEMS[name];
    const { solution: probe } = solve(poem, null);
    const slowest = totalAt(poem, TIMING.readableMinSpeed);
    const step = Math.max(150, Math.round((slowest - probe.minMs) / 25));
    let checked = 0;
    for (let target = probe.minMs; target < slowest; target += step) {
      const { solution } = solve(poem, target);
      expect(solution.mode, `${name} @ ${target}`).toBe("speed");
      expect(Math.abs(solution.totalMs - target), `${name} @ ${target}`).toBeLessThanOrEqual(100);
      // The reported total is the real one.
      expect(solution.totalMs).toBe(totalAt(poem, solution.speed));
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("hits the ABAB poem's 15 s preset", () => {
    const { solution } = solve(LAMP_ABAB, 15000);
    expect(solution.mode).toBe("speed");
    expect(Math.abs(solution.totalMs - 15000)).toBeLessThanOrEqual(100);
    expect(solution.speed).toBeGreaterThan(0.9);
    expect(solution.speed).toBeLessThan(1.1);
  });

  it("is monotone: a longer target never means a faster pace", () => {
    const speeds = [9000, 11000, 13000, 15000, 18000, 22000].map((t) => solve(LAMP_ABAB, t).solution.speed);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeLessThanOrEqual(speeds[i - 1] + 1e-9);
  });

  it("treats the lead-in and the final hold as fixed: only the rest of the poem stretches", () => {
    const { prosody, analysis } = prepare(LAMP_ABAB);
    const solution = speedForDuration(prosody, analysis, TENDER, 10000);
    const timeline = buildTimeline(prosody, analysis, TENDER, solution.speed);
    expect(timeline.events.find((e) => e.type === "appear")!.start).toBe(TIMING.leadInMs);
    const lastAppear = timeline.events.filter((e) => e.type === "appear").pop()!;
    expect(timeline.totalMs - (lastAppear.start + lastAppear.duration)).toBeGreaterThanOrEqual(TIMING.finalHoldMs);
  });

  it("works for every mood", () => {
    for (const mood of Object.values(MOOD_PRESETS)) {
      const { solution } = solve(LAMP_ABAB, 12000, mood);
      expect(solution.reachable).toBe(true);
      expect(Math.abs(solution.totalMs - 12000), mood.id).toBeLessThanOrEqual(100);
    }
  });
});

describe("speedForDuration: clamps", () => {
  it("never leaves the readable speed range, whatever the target", () => {
    for (let target = 500; target <= 200_000; target += 4_937) {
      const { solution } = solve(LAMP_ABAB, target);
      expect(solution.speed).toBeGreaterThanOrEqual(TIMING.readableMinSpeed);
      expect(solution.speed).toBeLessThanOrEqual(TIMING.readableMaxSpeed);
    }
  });

  it("a target below the shortest readable duration is unreachable: it reports the minimum, not a rushed poem", () => {
    const { solution } = solve(LAMP_ABAB, 7000); // the ABAB poem cannot be read in 7 s
    expect(solution).toMatchObject({ mode: "too-short", reachable: false, speed: TIMING.readableMaxSpeed, extraHoldMs: 0 });
    expect(solution.minMs).toBeGreaterThan(7000);
    expect(solution.totalMs).toBe(solution.minMs);
    expect(solution.minMs).toBe(totalAt(LAMP_ABAB, TIMING.readableMaxSpeed));
  });

  it("the shortest readable duration itself is reachable", () => {
    const { solution: probe } = solve(LAMP_ABAB, null);
    const { solution } = solve(LAMP_ABAB, probe.minMs);
    expect(solution.reachable).toBe(true);
    expect(Math.abs(solution.totalMs - probe.minMs)).toBeLessThanOrEqual(100);
  });

  it("a very short poem can reach 7 s", () => {
    expect(solve("moon", 7000).solution.reachable).toBe(true);
  });
});

describe("speedForDuration: extending the hold", () => {
  it("above the slowest readable pace it keeps that pace and holds the finished poster longer", () => {
    const { solution } = solve(LAMP_ABAB, 60000);
    expect(solution).toMatchObject({ mode: "hold", speed: TIMING.readableMinSpeed, reachable: true });
    expect(solution.extraHoldMs).toBeGreaterThan(0);
    expect(solution.totalMs).toBe(60000);
    expect(totalAt(LAMP_ABAB, solution.speed, solution.extraHoldMs)).toBe(60000);
  });

  it("the extra hold is exactly the gap between the slowest pace and the target", () => {
    const slowest = totalAt(LAMP_ABAB, TIMING.readableMinSpeed);
    const { solution } = solve(LAMP_ABAB, slowest + 12345);
    expect(solution.mode).toBe("hold");
    expect(solution.extraHoldMs).toBe(12345);
  });

  it("is exactly at the boundary: the slowest pace's own duration needs no extra hold", () => {
    const slowest = totalAt(LAMP_ABAB, TIMING.readableMinSpeed);
    const { solution } = solve(LAMP_ABAB, slowest);
    expect(solution).toMatchObject({ mode: "hold", extraHoldMs: 0, speed: TIMING.readableMinSpeed });
  });

  it("the timeline's final hold grows by exactly the extra hold", () => {
    expect(totalAt(LAMP_ABAB, 0.5, 4000)).toBe(totalAt(LAMP_ABAB, 0.5) + 4000);
    expect(totalAt(LAMP_ABAB, 0.5, -500)).toBe(totalAt(LAMP_ABAB, 0.5)); // never negative
  });
});

describe("speedForDuration: fixed costs besides speed", () => {
  it("accounts for a title above the poem (its lead-in is fixed time)", () => {
    const target = 15000;
    const { solution } = solve(LAMP_ABAB, target, TENDER, { title: true });
    expect(Math.abs(solution.totalMs - target)).toBeLessThanOrEqual(100);
    expect(solution.minMs).toBeGreaterThan(solve(LAMP_ABAB, null).solution.minMs);
  });

  it("accounts for page transitions on a paged poem", () => {
    const { prosody } = prepare(FORTY_LINES);
    const lines = prosody.stanzas.flatMap((s) => s.lines).length;
    const pageOfLine = Array.from({ length: lines }, (_, i) => Math.floor(i / 10)); // 4 pages
    const target = 120_000;
    const { solution } = solve(FORTY_LINES, target, TENDER, { pageOfLine });
    expect(Math.abs(solution.totalMs - target)).toBeLessThanOrEqual(100);
    const without = solve(FORTY_LINES, target).solution;
    expect(solution.speed).not.toBe(without.speed);
  });

  it("accounts for switched-off echoes", () => {
    const { solution } = solve(LAMP_ABAB, 12000, TENDER, { echoes: false });
    expect(Math.abs(solution.totalMs - 12000)).toBeLessThanOrEqual(100);
  });

  it("is deterministic", () => {
    expect(solve(LAMP_ABAB, 13000).solution).toEqual(solve(LAMP_ABAB, 13000).solution);
  });

  it("copes with empty input", () => {
    expect(() => solve("", 15000)).not.toThrow();
    expect(solve("", null).solution.mode).toBe("auto");
  });
});
