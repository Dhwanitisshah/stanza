// Browser only: exports the reel. Frame by frame through WebCodecs when the browser can encode H.264,
// otherwise a real-time recording. Either way the pictures come from the same renderFrame the preview uses,
// with the same scene and the same resources (fonts loaded, photo, grain, pattern).
import { prepareResources } from "@/lib/render/browser";
import type { ImageAsset } from "@/lib/render/image";
import { renderFrame } from "@/lib/render/renderFrame";
import type { Scene } from "@/lib/render/types";
import { pickH264Config, pickRecorderType, type H264EncoderConfig, type RecorderType } from "./codec";
import { encodeFrames, yieldToUi } from "./encodeFrames";
import { EXPORT_FPS, frameTimes } from "./frameTimes";
import { recordRealtime } from "./recordRealtime";
import { createWebCodecsSink } from "./webcodecsSink";

export const VIDEO_BITRATE = 8_000_000;

/** How this browser will make the video, decided before the user presses the button so the dialog can be honest about it. */
export type ReelMethod =
  | { kind: "frames"; profile: string; config: H264EncoderConfig }
  | { kind: "realtime"; type: RecorderType }
  | { kind: "none" };

const hasWebCodecs = () => typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";

/** `forceRealtime` is for testing the fallback in a browser that could do better (add ?export=realtime to the address). */
export async function probeReel(scene: Scene, forceRealtime = false): Promise<ReelMethod> {
  if (!forceRealtime && hasWebCodecs()) {
    const { width, height } = scene.layout;
    const picked = await pickH264Config({ width, height, fps: EXPORT_FPS, bitrate: VIDEO_BITRATE }, (config) => VideoEncoder.isConfigSupported(config));
    if (picked) return { kind: "frames", profile: picked.profile, config: picked.config };
  }
  if (typeof MediaRecorder !== "undefined") {
    const type = pickRecorderType((mime) => MediaRecorder.isTypeSupported(mime));
    if (type) return { kind: "realtime", type };
  }
  return { kind: "none" };
}

export interface ReelProgress {
  method: "frames" | "realtime";
  /** Frames encoded (frames) or milliseconds recorded (realtime). */
  done: number;
  /** Frames in all (frames) or the length of the poem in ms (realtime). */
  total: number;
}

export interface ReelResult {
  blob: Blob;
  extension: "mp4" | "webm";
  method: "frames" | "realtime";
  frames: number;
  /** How long the export took, in ms. */
  encodeMs: number;
}

export interface ExportReelOptions {
  scene: Scene;
  image: ImageAsset | null;
  method: Exclude<ReelMethod, { kind: "none" }>;
  signal?: AbortSignal;
  onProgress?: (progress: ReelProgress) => void;
}

/** A canvas of its own at export size: the preview keeps its canvas, and the export never touches the screen. */
function exportCanvas(scene: Scene) {
  const canvas = document.createElement("canvas");
  canvas.width = scene.layout.width;
  canvas.height = scene.layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the poster for export.");
  return { canvas, ctx };
}

export async function exportReel({ scene, image, method, signal, onProgress }: ExportReelOptions): Promise<ReelResult> {
  const started = performance.now();
  const { canvas, ctx } = exportCanvas(scene);
  const resources = prepareResources(scene, image);
  const draw = (t: number) => renderFrame(ctx, scene, t, resources);
  const totalMs = scene.timeline.totalMs;

  if (method.kind === "frames") {
    const times = frameTimes(totalMs, EXPORT_FPS);
    const sink = await createWebCodecsSink(canvas, method.config, EXPORT_FPS, yieldToUi);
    const blob = await encodeFrames({
      times,
      fps: EXPORT_FPS,
      draw,
      sink,
      signal,
      yieldToUi,
      onProgress: (done, total) => onProgress?.({ method: "frames", done, total }),
    });
    return { blob, extension: "mp4", method: "frames", frames: times.length, encodeMs: performance.now() - started };
  }

  const blob = await recordRealtime({
    canvas,
    fps: EXPORT_FPS,
    totalMs,
    type: method.type,
    draw,
    signal,
    onProgress: (done, total) => onProgress?.({ method: "realtime", done, total }),
  });
  return { blob, extension: method.type.container, method: "realtime", frames: 0, encodeMs: performance.now() - started };
}
