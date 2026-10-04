// PURE: which moments of the poem become video frames.
//
// Frame i is drawn at t = i * 1000 / fps. The time comes from the frame NUMBER, never from adding up small steps,
// so rounding cannot drift: frame 450 of a 30 fps video is at exactly 15000 ms however long the video is.

export const EXPORT_FPS = 30;

/**
 * The times (ms) at which to draw frames, for a poem that lasts `totalMs`.
 *   - count = ceil(totalMs * fps / 1000), so the video lasts at least `totalMs` and less than one frame longer;
 *   - the LAST frame is drawn at exactly `totalMs`, which is the finished poster (footer fully in, nothing dimmed).
 *     Without this, a video whose length is not a whole number of frames would end a hair before the poster is done.
 *     The last step can be up to two frame-intervals long; nothing is moving then (it is the final hold).
 */
export function frameTimes(totalMs: number, fps: number = EXPORT_FPS): number[] {
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError("fps must be a positive number");
  if (!Number.isFinite(totalMs) || totalMs <= 0) return [0];
  const count = Math.max(1, Math.ceil((totalMs * fps) / 1000));
  const times = Array.from({ length: count }, (_, i) => (i * 1000) / fps);
  times[count - 1] = totalMs;
  return times;
}

/** The presentation timestamp of frame `index` in microseconds (what VideoFrame wants), again from the number alone. */
export const frameTimestampUs = (index: number, fps: number = EXPORT_FPS): number => Math.round((index * 1_000_000) / fps);

/** One frame lasts this long, in microseconds. */
export const frameDurationUs = (fps: number = EXPORT_FPS): number => Math.round(1_000_000 / fps);

/** A key frame every `seconds` seconds: frame 0, then every fps * seconds frames. */
export const isKeyFrame = (index: number, fps: number = EXPORT_FPS, seconds = 2): boolean => index % Math.round(fps * seconds) === 0;
