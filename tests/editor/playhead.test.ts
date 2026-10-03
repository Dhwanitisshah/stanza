import { describe, expect, it, vi } from "vitest";
import { createPlayer, type Scheduler } from "@/lib/render/player";
import { buildScene } from "@/lib/render/scene";
import type { MoodId } from "@/lib/moods/ids";
import { LAMP_ABAB } from "../fixtures/poems";
import { monospace, prepare } from "../helpers";

function manualScheduler() {
  let pending: { id: number; cb: (now: number) => void } | null = null;
  let nextId = 1;
  const scheduler: Scheduler = {
    request(cb) {
      pending = { id: nextId++, cb };
      return pending.id;
    },
    cancel(id) {
      if (pending?.id === id) pending = null;
    },
  };
  return {
    scheduler,
    frame(now: number) {
      const job = pending;
      pending = null;
      job?.cb(now);
    },
    hasPending: () => pending !== null,
  };
}

const sceneFor = (mood: MoodId, lengthMs: number | null = null) => {
  const { prosody, analysis } = prepare(LAMP_ABAB);
  return buildScene({ prosody, analysis, mood, lengthMs, format: "reel", speed: 1, measureText: monospace });
};

describe("player.setTotal: the playhead keeps its place", () => {
  function setup(total = 10_000, initialT = 0) {
    const clock = manualScheduler();
    const draw = vi.fn();
    const player = createPlayer({ totalMs: total, draw, scheduler: clock.scheduler, initialT });
    return { ...clock, draw, player };
  }

  it("keeps the same FRACTION of the whole when the length changes", () => {
    const { player } = setup(10_000, 4_000);
    player.setTotal(20_000);
    expect(player.getState().t).toBeCloseTo(8_000);
    player.setTotal(5_000);
    expect(player.getState().t).toBeCloseTo(2_000);
  });

  it("keeps playing, and carries on from the new place", () => {
    const { player, frame, hasPending } = setup(10_000, 5_000);
    player.play();
    frame(0);
    player.setTotal(20_000);
    expect(player.getState()).toMatchObject({ playing: true, t: 10_000 });
    expect(hasPending()).toBe(true);
    frame(16);
    expect(player.getState().t).toBeCloseTo(10_016);
  });

  it("stays paused if it was paused", () => {
    const { player, hasPending } = setup(10_000, 3_000);
    player.setTotal(12_000);
    expect(player.getState().playing).toBe(false);
    expect(hasPending()).toBe(false);
  });

  it("a finished poster stays finished (the final frame is still the final frame)", () => {
    const { player } = setup(10_000, 10_000);
    player.setTotal(15_000);
    expect(player.getState().t).toBe(15_000);
  });

  it("the start stays the start", () => {
    const { player } = setup(10_000, 0);
    player.setTotal(25_000);
    expect(player.getState().t).toBe(0);
  });

  it("draws again, even though the time did not change: the poster itself may look different", () => {
    const { player, draw } = setup(10_000, 0);
    player.redraw();
    draw.mockClear();
    player.setTotal(10_000);
    player.redraw();
    expect(draw).toHaveBeenCalledTimes(1);
    player.setTotal(10_000);
    player.redraw();
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("notifies listeners so the time readout and the strip update", () => {
    const { player } = setup(10_000, 4_000);
    const listener = vi.fn();
    player.subscribe(listener);
    player.setTotal(20_000);
    expect(listener).toHaveBeenCalled();
  });

  it("clamps what comes after: seeks use the new total", () => {
    const { player } = setup(10_000, 0);
    player.setTotal(4_000);
    player.seek(9_000);
    expect(player.getState().t).toBe(4_000);
  });

  it("copes with a zero, negative or non-finite total without producing NaN", () => {
    for (const total of [0, -5, NaN, Infinity]) {
      const { player } = setup(10_000, 5_000);
      player.setTotal(total);
      expect(Number.isFinite(player.getState().t)).toBe(true);
    }
  });

  it("and recovers when a real length comes back after a zero one", () => {
    const { player } = setup(10_000, 5_000);
    player.setTotal(0);
    player.setTotal(10_000);
    expect(Number.isFinite(player.getState().t)).toBe(true);
  });
});

describe("a change of style keeps the playhead (real scenes)", () => {
  it("across a mood change: Tender -> Restless has a different length, and the same fraction", () => {
    const tender = sceneFor("Tender");
    const restless = sceneFor("Restless");
    expect(restless.timeline.totalMs).not.toBe(tender.timeline.totalMs);

    const clock = manualScheduler();
    const player = createPlayer({ totalMs: tender.timeline.totalMs, draw: () => {}, scheduler: clock.scheduler, initialT: tender.timeline.totalMs * 0.4 });
    player.setTotal(restless.timeline.totalMs);
    expect(player.getState().t / restless.timeline.totalMs).toBeCloseTo(0.4, 6);
  });

  it("across a length change: Auto -> 30 s", () => {
    const auto = sceneFor("Tender");
    const thirty = sceneFor("Tender", 30_000);
    expect(Math.abs(thirty.timeline.totalMs - 30_000)).toBeLessThanOrEqual(100);

    const clock = manualScheduler();
    const player = createPlayer({ totalMs: auto.timeline.totalMs, draw: () => {}, scheduler: clock.scheduler, initialT: auto.timeline.totalMs * 0.25 });
    player.setTotal(thirty.timeline.totalMs);
    expect(player.getState().t / thirty.timeline.totalMs).toBeCloseTo(0.25, 6);
  });

  it("through a whole chain of changes: moods, lengths and formats never throw the viewer back to the start", () => {
    const clock = manualScheduler();
    const start = sceneFor("Tender");
    const player = createPlayer({ totalMs: start.timeline.totalMs, draw: () => {}, scheduler: clock.scheduler, initialT: start.timeline.totalMs * 0.6 });
    for (const next of [sceneFor("Defiant"), sceneFor("Joyful", 20_000), sceneFor("Reverent", 60_000), sceneFor("Restless"), sceneFor("Melancholy", 15_000)]) {
      player.setTotal(next.timeline.totalMs);
      expect(player.getState().t / next.timeline.totalMs).toBeCloseTo(0.6, 6);
    }
  });
});
