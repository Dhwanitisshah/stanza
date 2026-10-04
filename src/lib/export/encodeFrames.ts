// The frame-by-frame loop. It knows nothing about WebCodecs or canvases: it draws a frame, hands it to a "sink",
// reports progress, lets the page breathe, and cleans up if anything goes wrong or the user cancels.
// That is what makes the cancel and error paths testable with a fake sink.
import { frameDurationUs, frameTimestampUs, isKeyFrame } from "./frameTimes";

/** Where finished frames go (the real one is an H.264 encoder writing into an MP4). */
export interface FrameSink {
  /** Encodes what is on the export canvas right now as frame `index`. */
  encodeFrame(frame: { index: number; timestampUs: number; durationUs: number; keyFrame: boolean }): Promise<void>;
  /** Flushes the encoder and closes the file. Returns the finished video. */
  finish(): Promise<Blob>;
  /** Releases everything without producing a file. Safe to call more than once, and after finish(). */
  abort(): Promise<void>;
}

export class ExportCancelled extends Error {
  constructor() {
    super("Export cancelled.");
    this.name = "ExportCancelled";
  }
}

export interface EncodeFramesOptions {
  /** The moments to draw, from frameTimes(). */
  times: readonly number[];
  fps: number;
  /** Draws the poster at time t onto the export canvas (renderFrame with the same scene and resources as the preview). */
  draw: (t: number) => void;
  sink: FrameSink;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Gives the page a turn (progress bar, Cancel button). Injected so tests do not wait. */
  yieldToUi: () => Promise<void>;
  /** Yield after this many frames. */
  yieldEvery?: number;
}

export const YIELD_EVERY_FRAMES = 4;

/** Draws and encodes every frame in order. Resolves with the video; on cancel rejects with ExportCancelled. Always releases the sink. */
export async function encodeFrames({ times, fps, draw, sink, signal, onProgress, yieldToUi, yieldEvery = YIELD_EVERY_FRAMES }: EncodeFramesOptions): Promise<Blob> {
  const total = times.length;
  const durationUs = frameDurationUs(fps);
  let finished = false;
  try {
    for (let index = 0; index < total; index++) {
      if (signal?.aborted) throw new ExportCancelled();
      draw(times[index]);
      await sink.encodeFrame({ index, timestampUs: frameTimestampUs(index, fps), durationUs, keyFrame: isKeyFrame(index, fps) });
      onProgress?.(index + 1, total);
      if ((index + 1) % yieldEvery === 0) await yieldToUi();
    }
    if (signal?.aborted) throw new ExportCancelled();
    const blob = await sink.finish();
    finished = true;
    return blob;
  } finally {
    // Cancelled, failed, or (harmlessly) finished: nothing stays open.
    if (!finished) await sink.abort().catch(() => undefined);
  }
}

/** One turn of the event loop. A MessageChannel message is not slowed down in a background tab the way setTimeout is. */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}
