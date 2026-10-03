import { describe, expect, it, vi } from "vitest";
import { createPlayer, MAX_FRAME_DELTA_MS, type Scheduler } from "@/lib/render/player";

/** A scheduler we drive by hand: frame(ms) runs the pending callback at that timestamp. */
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

function setup(options: { totalMs?: number; initialT?: number; loop?: boolean } = {}) {
  const clock = manualScheduler();
  const draw = vi.fn();
  const player = createPlayer({ totalMs: 1000, draw, scheduler: clock.scheduler, ...options });
  return { ...clock, draw, player };
}

describe("createPlayer", () => {
  it("starts paused at the initial time, clamped into range", () => {
    expect(setup().player.getState()).toEqual({ t: 0, playing: false, loop: false });
    expect(setup({ initialT: 5000 }).player.getState().t).toBe(1000);
    expect(setup({ initialT: -5 }).player.getState().t).toBe(0);
  });

  it("advances time with the clock while playing, and draws each new time", () => {
    const { player, frame, draw } = setup();
    player.play();
    frame(1000); // first frame only sets the baseline
    frame(1016);
    frame(1033);
    expect(player.getState().t).toBeCloseTo(33);
    // Drawn at play() (t=0), then only when time moved: the baseline frame at t=0 does not redraw.
    expect(draw.mock.calls.map((c) => c[0])).toEqual([0, 16, 33]);
  });

  it("redraws only when t changed", () => {
    const { player, draw } = setup();
    player.seek(300);
    player.seek(300);
    player.seek(300);
    expect(draw).toHaveBeenCalledTimes(1);
    player.seek(301);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("does not draw while paused and nothing changes", () => {
    const { player, frame, draw, hasPending } = setup();
    player.play();
    player.pause();
    expect(hasPending()).toBe(false);
    frame(5000);
    expect(draw).toHaveBeenCalledTimes(1); // just the draw from play()
    expect(player.getState().playing).toBe(false);
  });

  it("stops at the end and holds the final frame", () => {
    const { player, frame, draw } = setup();
    player.seek(950);
    player.play();
    frame(0);
    frame(60);
    expect(player.getState()).toMatchObject({ t: 1000, playing: false });
    expect(draw).toHaveBeenLastCalledWith(1000);
  });

  it("loops: wraps past the end and keeps playing", () => {
    const { player, frame } = setup({ loop: true });
    player.seek(980);
    player.play();
    frame(0);
    frame(50);
    expect(player.getState().playing).toBe(true);
    expect(player.getState().t).toBeCloseTo(30);
  });

  it("can toggle looping while it runs", () => {
    const { player } = setup();
    player.setLoop(true);
    expect(player.getState().loop).toBe(true);
  });

  it("play on a finished poem starts again from 0; restart always does", () => {
    const { player } = setup({ initialT: 1000 });
    player.play();
    expect(player.getState()).toMatchObject({ t: 0, playing: true });
    player.seek(600);
    player.restart();
    expect(player.getState()).toMatchObject({ t: 0, playing: true });
  });

  it("toggles between play and pause", () => {
    const { player } = setup();
    player.toggle();
    expect(player.getState().playing).toBe(true);
    player.toggle();
    expect(player.getState().playing).toBe(false);
  });

  it("does not jump ahead after a long stall between frames", () => {
    const { player, frame } = setup();
    player.play();
    frame(0);
    frame(10_000);
    expect(player.getState().t).toBe(MAX_FRAME_DELTA_MS);
  });

  it("keeps playing from the seek position when scrubbed during playback", () => {
    const { player, frame } = setup();
    player.play();
    frame(0);
    player.seek(500);
    frame(16);
    expect(player.getState().t).toBeCloseTo(516);
    expect(player.getState().playing).toBe(true);
  });

  it("clamps seeks and ignores non-finite times", () => {
    const { player } = setup();
    player.seek(-50);
    expect(player.getState().t).toBe(0);
    player.seek(99999);
    expect(player.getState().t).toBe(1000);
    player.seek(NaN);
    expect(player.getState().t).toBe(0);
  });

  it("notifies subscribers, and stops after unsubscribe", () => {
    const { player, frame } = setup();
    const listener = vi.fn();
    const unsubscribe = player.subscribe(listener);
    player.play();
    frame(0);
    frame(16);
    const calls = listener.mock.calls.length;
    expect(calls).toBeGreaterThan(1);
    unsubscribe();
    frame(32);
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it("redraw() forces a draw of the current time even if it did not change", () => {
    const { player, draw } = setup({ initialT: 400 });
    player.redraw();
    player.redraw();
    expect(draw.mock.calls).toEqual([[400], [400]]);
    player.seek(401);
    player.redraw();
    expect(draw.mock.calls.map((c) => c[0])).toEqual([400, 400, 401, 401]);
  });

  it("can be given its draw function after creation (the canvas mounts later)", () => {
    const clock = manualScheduler();
    const player = createPlayer({ totalMs: 1000, scheduler: clock.scheduler, initialT: 250 });
    expect(() => player.redraw()).not.toThrow(); // no draw function yet: nothing happens
    const draw = vi.fn();
    player.setDraw(draw);
    player.redraw();
    expect(draw).toHaveBeenCalledWith(250);
  });

  it("gives immutable state snapshots (safe for useSyncExternalStore)", () => {
    const { player } = setup();
    const before = player.getState();
    expect(player.getState()).toBe(before);
    player.seek(10);
    expect(player.getState()).not.toBe(before);
    expect(before.t).toBe(0);
  });
});
