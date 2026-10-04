import { describe, expect, it, vi } from "vitest";
import { avcCodecString, H264_PROFILES, pickH264Config, pickRecorderType, type H264EncoderConfig, type IsConfigSupported } from "@/lib/export/codec";

const settings = { width: 1080, height: 1920, fps: 30, bitrate: 8_000_000 };
const supportOnly = (...profileHex: string[]): IsConfigSupported => async (config) => ({ supported: profileHex.some((hex) => config.codec.startsWith(`avc1.${hex}`)) });

describe("pickH264Config: High, then Main, then Baseline", () => {
  it("asks about the profiles in that order and stops at the first that works", async () => {
    const asked: string[] = [];
    const isSupported: IsConfigSupported = async (config) => {
      asked.push(config.codec);
      return { supported: true };
    };
    const picked = await pickH264Config(settings, isSupported);
    expect(asked).toEqual(["avc1.64002A"]); // High answered yes: nobody else is asked
    expect(picked?.profile).toBe("High");
  });

  it("falls back to Main when High is refused", async () => {
    const asked: string[] = [];
    const isSupported: IsConfigSupported = async (config) => {
      asked.push(config.codec);
      return supportOnly("4D", "42")(config);
    };
    const picked = await pickH264Config(settings, isSupported);
    expect(asked).toEqual(["avc1.64002A", "avc1.4D002A"]);
    expect(picked?.profile).toBe("Main");
    expect(picked?.config.codec).toBe("avc1.4D002A");
  });

  it("falls back to Baseline when only Baseline works", async () => {
    const asked: string[] = [];
    const isSupported: IsConfigSupported = async (config) => {
      asked.push(config.codec);
      return supportOnly("42")(config);
    };
    const picked = await pickH264Config(settings, isSupported);
    expect(asked).toEqual(["avc1.64002A", "avc1.4D002A", "avc1.42002A"]);
    expect(picked?.profile).toBe("Baseline");
  });

  it("returns null when none works (then the real-time recorder takes over)", async () => {
    const isSupported = vi.fn<IsConfigSupported>(async () => ({ supported: false }));
    expect(await pickH264Config(settings, isSupported)).toBeNull();
    expect(isSupported).toHaveBeenCalledTimes(3);
  });

  it("treats a missing or undefined answer as a no", async () => {
    expect(await pickH264Config(settings, async () => ({}))).toBeNull();
  });

  it("a browser that THROWS for one profile is still asked about the next", async () => {
    let calls = 0;
    const isSupported: IsConfigSupported = async (config) => {
      calls++;
      if (config.codec.startsWith("avc1.64")) throw new TypeError("bad codec string");
      return { supported: true };
    };
    const picked = await pickH264Config(settings, isSupported);
    expect(calls).toBe(2);
    expect(picked?.profile).toBe("Main");
  });

  it("hands back a complete config: size, bitrate, frame rate and the length-prefixed avc format the MP4 needs", async () => {
    const picked = await pickH264Config(settings, async () => ({ supported: true }));
    expect(picked?.config).toEqual<H264EncoderConfig>({
      codec: "avc1.64002A",
      width: 1080,
      height: 1920,
      bitrate: 8_000_000,
      framerate: 30,
      avc: { format: "avc" },
      latencyMode: "quality",
    });
  });

  it("passes the real export size, so a Post is asked about 1080 x 1350", async () => {
    const sizes: string[] = [];
    await pickH264Config({ ...settings, height: 1350 }, async (config) => {
      sizes.push(`${config.width}x${config.height}`);
      return { supported: true };
    });
    expect(sizes).toEqual(["1080x1350"]);
  });

  it("the codec strings are profile, constraint flags and level 4.2", () => {
    expect(H264_PROFILES.map((p) => p.name)).toEqual(["High", "Main", "Baseline"]);
    expect(avcCodecString("64")).toBe("avc1.64002A");
    expect(avcCodecString("4D")).toBe("avc1.4D002A");
    expect(avcCodecString("42")).toBe("avc1.42002A");
  });
});

describe("pickRecorderType: MP4 first, then WebM", () => {
  const supports = (...mimes: string[]) => (mime: string) => mimes.includes(mime);

  it("prefers MP4 when the browser can record it", () => {
    expect(pickRecorderType(supports("video/mp4", "video/webm;codecs=vp9"))).toEqual({ mime: "video/mp4", container: "mp4" });
    expect(pickRecorderType(supports("video/mp4;codecs=avc1.42E01E", "video/mp4"))?.mime).toBe("video/mp4;codecs=avc1.42E01E");
  });

  it("falls back to WebM (VP9, then VP8, then plain) and says so", () => {
    expect(pickRecorderType(supports("video/webm;codecs=vp9", "video/webm"))).toEqual({ mime: "video/webm;codecs=vp9", container: "webm" });
    expect(pickRecorderType(supports("video/webm;codecs=vp8", "video/webm"))).toEqual({ mime: "video/webm;codecs=vp8", container: "webm" });
    expect(pickRecorderType(supports("video/webm"))).toEqual({ mime: "video/webm", container: "webm" });
  });

  it("returns null when nothing can be recorded, and survives a throwing browser", () => {
    expect(pickRecorderType(() => false)).toBeNull();
    expect(
      pickRecorderType((mime) => {
        if (mime.startsWith("video/mp4")) throw new Error("nope");
        return mime === "video/webm";
      }),
    ).toEqual({ mime: "video/webm", container: "webm" });
  });
});
