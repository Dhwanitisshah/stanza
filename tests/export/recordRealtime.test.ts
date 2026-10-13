import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportCancelled } from "@/lib/export/encodeFrames";
import { recordRealtime } from "@/lib/export/recordRealtime";

// The real-time recorder, with a fake MediaRecorder that behaves like current Chrome and Edge:
// it does not fire "start" until the canvas has produced a frame AFTER start() was called.
// The original code only began drawing inside onstart, so in those browsers it waited for a frame it never drew.

class FakeRecorder {
  static last: FakeRecorder;
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onstart: (() => void) | null = null;
  startFired = false;
  constructor() {
    FakeRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  /** Called by the fake canvas whenever something is drawn. */
  frameArrived() {
    if (this.state === "recording" && !this.startFired) {
      this.startFired = true;
      this.onstart?.();
    }
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["video bytes"]) });
    this.onstop?.();
  }
}

let now = 0;
let callbacks: { id: number; run: () => void }[] = [];
let nextId = 1;

/** Moves the clock forward one animation frame (16 ms) and runs whatever was waiting for it. */
function frame() {
  now += 16;
  const due = callbacks;
  callbacks = [];
  due.forEach((c) => c.run());
}

beforeEach(() => {
  now = 0;
  callbacks = [];
  nextId = 1;
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => {
    callbacks.push({ id: nextId, run });
    return nextId++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    callbacks = callbacks.filter((c) => c.id !== id);
  });
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(totalMs: number, extra: { signal?: AbortSignal } = {}) {
  const track = { stop: vi.fn() };
  const canvas = { captureStream: () => ({ getTracks: () => [track] }) } as unknown as HTMLCanvasElement;
  const times: number[] = [];
  const progress: [number, number][] = [];
  const draw = vi.fn((t: number) => {
    times.push(t);
    FakeRecorder.last?.frameArrived();
  });
  const promise = recordRealtime({
    canvas,
    fps: 30,
    totalMs,
    type: { mime: "video/webm", container: "webm" },
    draw,
    onProgress: (elapsed, total) => progress.push([elapsed, total]),
    ...extra,
  });
  return { promise, times, progress, track, draw };
}

describe("recordRealtime", () => {
  it("draws without waiting for the recorder's start event, so browsers that need a frame first can start", async () => {
    const { promise, times } = setup(500);
    expect(times).toEqual([0]); // the first picture is on the canvas before recording starts
    expect(FakeRecorder.last.state).toBe("recording");
    expect(FakeRecorder.last.startFired).toBe(false); // this recorder is waiting for a frame...

    frame();
    expect(times.length).toBeGreaterThan(1); // ...and the loop gives it one without waiting for "start"
    expect(FakeRecorder.last.startFired).toBe(true);

    for (let i = 0; i < 200 && callbacks.length > 0; i++) frame();
    expect((await promise).size).toBeGreaterThan(0);
  });

  it("plays the poster in real time: times rise to the end of the poem, progress ends at 100%", async () => {
    const { promise, times, progress } = setup(500);
    for (let i = 0; i < 200 && callbacks.length > 0; i++) frame();
    await promise;

    const poemTimes = times.slice(1);
    expect(poemTimes[0]).toBe(16);
    expect(poemTimes.every((t, i) => i === 0 || t >= poemTimes[i - 1])).toBe(true);
    expect(Math.max(...times)).toBe(500); // never past the end of the poem, though it records a moment longer
    expect(progress[progress.length - 1]).toEqual([500, 500]);
  });

  it("keeps recording a short tail after the last frame so that frame reaches the file", async () => {
    const { promise, draw } = setup(500);
    let frames = 0;
    for (let i = 0; i < 200 && callbacks.length > 0; i++, frames++) frame();
    await promise;
    expect(frames * 16).toBeGreaterThanOrEqual(500 + 400); // poem + TAIL_MS
    expect(draw).toHaveBeenCalled();
  });

  it("releases the stream and the animation loop when it finishes", async () => {
    const { promise, track } = setup(200);
    for (let i = 0; i < 200 && callbacks.length > 0; i++) frame();
    await promise;
    expect(track.stop).toHaveBeenCalled();
    expect(callbacks).toHaveLength(0);
  });

  it("rejects with ExportCancelled when aborted, and stops everything", async () => {
    const controller = new AbortController();
    const { promise, track } = setup(10_000, { signal: controller.signal });
    frame();
    frame();
    controller.abort();
    frame();
    await expect(promise).rejects.toBeInstanceOf(ExportCancelled);
    expect(track.stop).toHaveBeenCalled();
    expect(callbacks).toHaveLength(0);
    expect(FakeRecorder.last.state).toBe("inactive");
  });
});
