// Browser only: the FALLBACK. When this browser cannot encode H.264 frame by frame, play the poster in real time
// onto a canvas and record it with MediaRecorder. It takes as long as the poem does, the tab must stay in front
// (browsers slow animation in background tabs), and the result may be WebM, which Instagram does not accept.
import type { RecorderType } from "./codec";
import { ExportCancelled } from "./encodeFrames";

const BITS_PER_SECOND = 8_000_000;
/** After the last frame is drawn, keep recording a moment so that frame makes it into the file. */
const TAIL_MS = 400;

export interface RecordOptions {
  canvas: HTMLCanvasElement;
  fps: number;
  totalMs: number;
  type: RecorderType;
  /** Draws the poster at time t onto `canvas`. */
  draw: (t: number) => void;
  signal?: AbortSignal;
  onProgress?: (elapsedMs: number, totalMs: number) => void;
}

export function recordRealtime({ canvas, fps, totalMs, type, draw, signal, onProgress }: RecordOptions): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: BITS_PER_SECOND });
    const chunks: Blob[] = [];
    let frame = 0;
    let cancelled = false;
    let failed: unknown = null;

    const release = () => {
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
    };
    const stop = () => {
      if (recorder.state !== "inactive") recorder.stop();
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      failed = new Error("The browser's recorder failed.");
      stop();
    };
    recorder.onstop = () => {
      release();
      if (cancelled) reject(new ExportCancelled());
      else if (failed) reject(failed);
      else resolve(new Blob(chunks, { type: type.container === "mp4" ? "video/mp4" : "video/webm" }));
    };
    recorder.onstart = () => {
      const startedAt = performance.now();
      const tick = () => {
        if (signal?.aborted) {
          cancelled = true;
          stop();
          return;
        }
        const elapsed = performance.now() - startedAt;
        draw(Math.min(elapsed, totalMs));
        onProgress?.(Math.min(elapsed, totalMs), totalMs);
        if (elapsed >= totalMs + TAIL_MS) stop();
        else frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    draw(0); // something on the canvas before the first captured frame
    recorder.start(500);
  });
}
