// Browser only: H.264 through WebCodecs, muxed into an MP4 with Mediabunny.
// Each frame is a snapshot of the export canvas, so the video holds exactly what renderFrame drew.
import type { H264EncoderConfig } from "./codec";
import type { FrameSink } from "./encodeFrames";

/** Frames waiting in the encoder. Each one is ~8 MB of pixels, so we let it work through them before adding more. */
const MAX_QUEUE = 6;

export async function createWebCodecsSink(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  config: H264EncoderConfig,
  fps: number,
  yieldToUi: () => Promise<void>,
): Promise<FrameSink> {
  // Loaded only when someone exports, so the muxer is not part of the page everyone downloads first.
  const { BufferTarget, EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output } = await import("mediabunny");

  const target = new BufferTarget();
  // "in-memory" fast start puts the index at the front of the file, so phones and Instagram can start reading at once.
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const source = new EncodedVideoPacketSource("avc");
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  let failure: unknown = null;
  let writing: Promise<void> = Promise.resolve();
  let released = false;

  const encoder = new VideoEncoder({
    // Encoded packets arrive in order; we write them one after another.
    output: (chunk, meta) => {
      writing = writing
        .then(() => source.add(EncodedPacket.fromEncodedChunk(chunk), meta))
        .catch((error: unknown) => {
          failure ??= error;
        });
    },
    error: (error) => {
      failure ??= error;
    },
  });
  encoder.configure(config);

  const releaseEncoder = () => {
    released = true;
    if (encoder.state !== "closed") encoder.close();
  };
  const check = () => {
    if (failure) throw failure instanceof Error ? failure : new Error("The video encoder failed.");
  };

  return {
    async encodeFrame({ timestampUs, durationUs, keyFrame }) {
      check();
      while (encoder.encodeQueueSize > MAX_QUEUE) {
        await yieldToUi();
        check();
      }
      const frame = new VideoFrame(canvas, { timestamp: timestampUs, duration: durationUs });
      try {
        encoder.encode(frame, { keyFrame });
      } finally {
        frame.close(); // the encoder keeps its own reference
      }
    },

    async finish() {
      await encoder.flush();
      await writing;
      check();
      releaseEncoder();
      source.close();
      await output.finalize();
      if (!target.buffer) throw new Error("The video file came out empty.");
      return new Blob([target.buffer], { type: "video/mp4" });
    },

    async abort() {
      if (!released) releaseEncoder();
      // After a successful finish() the output is already "finalized"; there is nothing left to cancel.
      if (output.state !== "finalized" && output.state !== "canceled") await output.cancel();
    },
  };
}
