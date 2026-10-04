// PURE: choosing how to encode. The browser is asked through an injected function, so tests can answer for it.

export interface H264Settings {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

/** What VideoEncoder.configure() takes (the part we use). */
export interface H264EncoderConfig {
  codec: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
  avc: { format: "avc" };
  latencyMode: "quality";
}

export type IsConfigSupported = (config: H264EncoderConfig) => Promise<{ supported?: boolean }>;

/**
 * H.264 profile and level as an `avc1.PPCCLL` string: profile (64 High, 4D Main, 42 Baseline), constraint flags (00), level.
 * Level 4.2 (0x2A) is the first with room for 1080 x 1920 at 30 fps, and phones play it in hardware.
 */
export const H264_LEVEL = "2A";
export const H264_PROFILES = [
  { name: "High", hex: "64" },
  { name: "Main", hex: "4D" },
  { name: "Baseline", hex: "42" },
] as const;

export const avcCodecString = (profileHex: string): string => `avc1.${profileHex}00${H264_LEVEL}`;

export interface PickedCodec {
  config: H264EncoderConfig;
  profile: (typeof H264_PROFILES)[number]["name"];
}

/** Tries High, then Main, then Baseline; returns the first this browser can encode, or null (then we record in real time instead). */
export async function pickH264Config(settings: H264Settings, isSupported: IsConfigSupported): Promise<PickedCodec | null> {
  for (const profile of H264_PROFILES) {
    const config: H264EncoderConfig = {
      codec: avcCodecString(profile.hex),
      width: settings.width,
      height: settings.height,
      bitrate: settings.bitrate,
      framerate: settings.fps,
      avc: { format: "avc" },
      latencyMode: "quality",
    };
    try {
      const result = await isSupported(config);
      if (result.supported) return { config, profile: profile.name };
    } catch {
      // A browser that throws for one profile may still handle the next one.
    }
  }
  return null;
}

/** Real-time recording with MediaRecorder: the best container this browser will make. MP4 beats WebM (Instagram takes MP4). */
const RECORDER_TYPES = [
  { mime: "video/mp4;codecs=avc1.42E01E", container: "mp4" },
  { mime: "video/mp4", container: "mp4" },
  { mime: "video/webm;codecs=vp9", container: "webm" },
  { mime: "video/webm;codecs=vp8", container: "webm" },
  { mime: "video/webm", container: "webm" },
] as const;

export interface RecorderType {
  mime: string;
  container: "mp4" | "webm";
}

export function pickRecorderType(isTypeSupported: (mime: string) => boolean): RecorderType | null {
  for (const type of RECORDER_TYPES) {
    try {
      if (isTypeSupported(type.mime)) return { mime: type.mime, container: type.container };
    } catch {
      /* ignore and try the next one */
    }
  }
  return null;
}
