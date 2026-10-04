import { describe, expect, it } from "vitest";
import { encodeFrames, ExportCancelled, type FrameSink } from "@/lib/export/encodeFrames";
import { frameTimes } from "@/lib/export/frameTimes";

/** A sink that records what happened to it. `open` is the resource that must never be left held. */
class FakeSink implements FrameSink {
  frames: { index: number; timestampUs: number; durationUs: number; keyFrame: boolean }[] = [];
  finished = 0;
  aborted = 0;
  open = true;
  failEncodeAt: number | null = null;
  failFinish = false;
  failAbort = false;

  async encodeFrame(frame: { index: number; timestampUs: number; durationUs: number; keyFrame: boolean }) {
    if (this.failEncodeAt === frame.index) throw new Error("encoder exploded");
    this.frames.push(frame);
  }
  async finish() {
    this.finished++;
    if (this.failFinish) throw new Error("finalize failed");
    this.open = false;
    return new Blob(["video"], { type: "video/mp4" });
  }
  async abort() {
    this.aborted++;
    this.open = false;
    if (this.failAbort) throw new Error("abort failed too");
  }
}

const times = frameTimes(2000, 30); // 60 frames
const setup = () => {
  const sink = new FakeSink();
  const drawn: number[] = [];
  const yields = { count: 0 };
  const base = {
    times,
    fps: 30,
    sink,
    draw: (t: number) => void drawn.push(t),
    yieldToUi: async () => void yields.count++,
  };
  return { sink, drawn, yields, base };
};

describe("encodeFrames: the happy path", () => {
  it("draws every time in order, encodes each as a frame, then finishes once", async () => {
    const { sink, drawn, base } = setup();
    const blob = await encodeFrames(base);
    expect(drawn).toEqual(times);
    expect(sink.frames).toHaveLength(60);
    expect(sink.frames.map((f) => f.index)).toEqual(times.map((_, i) => i));
    expect(sink.finished).toBe(1);
    expect(sink.open).toBe(false);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("gives each frame its timestamp, one frame of duration, and a key frame every 2 seconds", async () => {
    const { sink, base } = setup();
    await encodeFrames(base);
    expect(sink.frames[0]).toEqual({ index: 0, timestampUs: 0, durationUs: 33_333, keyFrame: true });
    expect(sink.frames[30].timestampUs).toBe(1_000_000);
    expect(sink.frames.filter((f) => f.keyFrame).map((f) => f.index)).toEqual([0]); // 60 frames: the next key frame would be #60
    const long = setup();
    await encodeFrames({ ...long.base, times: frameTimes(5000, 30) });
    expect(long.sink.frames.filter((f) => f.keyFrame).map((f) => f.index)).toEqual([0, 60, 120]);
  });

  it("reports progress after every frame, ending at total / total", async () => {
    const { base } = setup();
    const seen: [number, number][] = [];
    await encodeFrames({ ...base, onProgress: (done, total) => seen.push([done, total]) });
    expect(seen).toHaveLength(60);
    expect(seen[0]).toEqual([1, 60]);
    expect(seen[59]).toEqual([60, 60]);
  });

  it("lets the page breathe every few frames (default 4), and as often as asked", async () => {
    const a = setup();
    await encodeFrames(a.base);
    expect(a.yields.count).toBe(15); // 60 / 4
    const b = setup();
    await encodeFrames({ ...b.base, yieldEvery: 10 });
    expect(b.yields.count).toBe(6);
  });

  it("works without an abort signal or a progress callback", async () => {
    const { base, sink } = setup();
    await expect(encodeFrames(base)).resolves.toBeInstanceOf(Blob);
    expect(sink.aborted).toBe(0);
  });
});

describe("encodeFrames: cancel cleans up", () => {
  it("cancelling mid-way stops encoding, never finishes, and aborts the sink exactly once", async () => {
    const { sink, drawn, base } = setup();
    const controller = new AbortController();
    const run = encodeFrames({ ...base, signal: controller.signal, onProgress: (done) => done === 5 && controller.abort() });
    await expect(run).rejects.toBeInstanceOf(ExportCancelled);
    expect(sink.frames).toHaveLength(5); // nothing after the click
    expect(drawn).toHaveLength(5);
    expect(sink.finished).toBe(0);
    expect(sink.aborted).toBe(1);
    expect(sink.open).toBe(false); // the encoder and the output are released
  });

  it("cancelling while the page is breathing (the realistic moment: the click arrives between frames)", async () => {
    const { sink, base } = setup();
    const controller = new AbortController();
    let yielded = 0;
    const run = encodeFrames({
      ...base,
      signal: controller.signal,
      yieldToUi: async () => {
        if (++yielded === 3) controller.abort(); // the user clicked Cancel during the third yield
      },
    });
    await expect(run).rejects.toThrow(ExportCancelled);
    expect(sink.frames).toHaveLength(12);
    expect(sink.aborted).toBe(1);
    expect(sink.finished).toBe(0);
    expect(sink.open).toBe(false);
  });

  it("already cancelled before the first frame: nothing is drawn, the sink is still released", async () => {
    const { sink, drawn, base } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(encodeFrames({ ...base, signal: controller.signal })).rejects.toBeInstanceOf(ExportCancelled);
    expect(drawn).toEqual([]);
    expect(sink.aborted).toBe(1);
    expect(sink.open).toBe(false);
  });

  it("cancelling during the very last frame still cancels (no half-finished file)", async () => {
    const { sink, base } = setup();
    const controller = new AbortController();
    await expect(encodeFrames({ ...base, signal: controller.signal, onProgress: (done, total) => done === total && controller.abort() })).rejects.toBeInstanceOf(ExportCancelled);
    expect(sink.finished).toBe(0);
    expect(sink.aborted).toBe(1);
  });

  it("the sink can be exported again afterwards: a second run on a fresh sink succeeds", async () => {
    const first = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(encodeFrames({ ...first.base, signal: controller.signal })).rejects.toBeInstanceOf(ExportCancelled);
    const second = setup();
    await expect(encodeFrames(second.base)).resolves.toBeInstanceOf(Blob);
    expect(second.sink.finished).toBe(1);
  });
});

describe("encodeFrames: errors clean up too", () => {
  it("a drawing error is rethrown, and the sink is released", async () => {
    const { sink, base } = setup();
    const run = encodeFrames({
      ...base,
      draw: (t) => {
        if (t > 500) throw new Error("font went missing");
      },
    });
    await expect(run).rejects.toThrow("font went missing");
    expect(sink.aborted).toBe(1);
    expect(sink.open).toBe(false);
    expect(sink.finished).toBe(0);
  });

  it("an encoder error mid-way is rethrown, and the sink is released", async () => {
    const { sink, base } = setup();
    sink.failEncodeAt = 20;
    await expect(encodeFrames(base)).rejects.toThrow("encoder exploded");
    expect(sink.frames).toHaveLength(20);
    expect(sink.aborted).toBe(1);
    expect(sink.open).toBe(false);
  });

  it("a failure while finishing the file aborts the sink as well", async () => {
    const { sink, base } = setup();
    sink.failFinish = true;
    await expect(encodeFrames(base)).rejects.toThrow("finalize failed");
    expect(sink.finished).toBe(1);
    expect(sink.aborted).toBe(1);
    expect(sink.open).toBe(false);
  });

  it("if releasing the sink fails too, the ORIGINAL error is the one the user hears about", async () => {
    const { sink, base } = setup();
    sink.failEncodeAt = 3;
    sink.failAbort = true;
    await expect(encodeFrames(base)).rejects.toThrow("encoder exploded");
    expect(sink.aborted).toBe(1);
  });

  it("a cancel is not reported as a failure: it is its own error type", async () => {
    const controller = new AbortController();
    controller.abort();
    const { base } = setup();
    const error = await encodeFrames({ ...base, signal: controller.signal }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExportCancelled);
    expect((error as Error).name).toBe("ExportCancelled");
  });
});
