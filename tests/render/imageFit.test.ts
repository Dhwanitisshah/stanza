import { describe, expect, it } from "vitest";
import { COVER_TARGET, coverRect, downscaledSize, IMAGE_LIMITS, imageFileProblem, MESSAGES } from "@/lib/render/imageFit";

const file = (name: string, type: string, size = 1_000_000) => ({ name, type, size });

describe("imageFileProblem", () => {
  it("accepts JPG, PNG, WebP and friends", () => {
    for (const f of [file("a.jpg", "image/jpeg"), file("a.JPEG", "image/jpeg"), file("b.png", "image/png"), file("c.webp", "image/webp"), file("d.gif", "image/gif"), file("e.avif", "image/avif")]) {
      expect(imageFileProblem(f), f.name).toBeNull();
    }
  });

  it("accepts an image whose browser-reported type is empty if the extension is right", () => {
    expect(imageFileProblem(file("photo.jpg", ""))).toBeNull();
    expect(imageFileProblem(file("photo.PNG", ""))).toBeNull();
  });

  it("gives HEIC its own friendly message, by type or by extension", () => {
    expect(imageFileProblem(file("IMG_0001.HEIC", "image/heic"))).toBe(MESSAGES.heic);
    expect(imageFileProblem(file("IMG_0001.heic", ""))).toBe(MESSAGES.heic);
    expect(imageFileProblem(file("x.heif", "image/heif"))).toBe(MESSAGES.heic);
    expect(MESSAGES.heic).toMatch(/JPG/);
  });

  it("rejects things that are not images", () => {
    for (const f of [file("poem.txt", "text/plain"), file("doc.pdf", "application/pdf"), file("noextension", "")]) {
      expect(imageFileProblem(f), f.name).toBe(MESSAGES.notAnImage);
    }
  });

  it("rejects files over the size limit, but allows one just under", () => {
    expect(imageFileProblem(file("big.jpg", "image/jpeg", IMAGE_LIMITS.maxBytes + 1))).toBe(MESSAGES.tooBig);
    expect(imageFileProblem(file("ok.jpg", "image/jpeg", IMAGE_LIMITS.maxBytes))).toBeNull();
  });

  it("checks HEIC before size, so the useful message wins", () => {
    expect(imageFileProblem(file("huge.heic", "image/heic", IMAGE_LIMITS.maxBytes * 2))).toBe(MESSAGES.heic);
  });
});

describe("downscaledSize", () => {
  it("shrinks a big photo to just cover the biggest export, keeping its shape", () => {
    expect(downscaledSize(6000, 4000)).toEqual({ width: 2880, height: 1920 });
    const tall = downscaledSize(3000, 6000);
    expect(tall.width / tall.height).toBeCloseTo(0.5, 2);
    expect(tall.width).toBeGreaterThanOrEqual(COVER_TARGET.width);
    expect(tall.height).toBeGreaterThanOrEqual(COVER_TARGET.height);
  });

  it("makes a huge photo small enough to keep in memory", () => {
    const { width, height } = downscaledSize(12000, 9000);
    expect(width * height).toBeLessThan(2880 * 2160 + 10);
  });

  it("never enlarges a small photo", () => {
    expect(downscaledSize(400, 300)).toEqual({ width: 400, height: 300 });
    expect(downscaledSize(1080, 1920)).toEqual({ width: 1080, height: 1920 });
  });

  it("covers both the Reel and the Post from what it keeps", () => {
    for (const [w, h] of [[6000, 4000], [4000, 6000], [5000, 5000], [9000, 2000], [2000, 9000]]) {
      const kept = downscaledSize(w, h);
      for (const [dw, dh] of [[1080, 1920], [1080, 1350]]) {
        const scale = Math.max(dw / kept.width, dh / kept.height);
        expect(scale, `${w}x${h} -> ${dw}x${dh}`).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("never returns zero", () => {
    expect(downscaledSize(1, 100000)).toMatchObject({ width: expect.any(Number) });
    expect(downscaledSize(1, 100000).width).toBeGreaterThanOrEqual(1);
  });
});

describe("coverRect", () => {
  it("fills the destination exactly when the shapes match", () => {
    expect(coverRect(540, 960, 1080, 1920)).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
  });

  it("crops the sides of a wide photo, centred", () => {
    const rect = coverRect(4000, 2000, 1080, 1920);
    expect(rect.height).toBeCloseTo(1920);
    expect(rect.width).toBeCloseTo(3840);
    expect(rect.x).toBeCloseTo((1080 - 3840) / 2);
    expect(rect.y).toBeCloseTo(0);
  });

  it("crops the top and bottom of a tall photo, centred", () => {
    const rect = coverRect(1000, 4000, 1080, 1350);
    expect(rect.width).toBeCloseTo(1080);
    expect(rect.height).toBeCloseTo(4320);
    expect(rect.y).toBeCloseTo((1350 - 4320) / 2);
  });

  it("always covers the whole destination", () => {
    for (const [w, h] of [[100, 100], [4000, 3000], [3000, 4000], [50, 5000], [5000, 50]]) {
      for (const [dw, dh] of [[1080, 1920], [1080, 1350]]) {
        const r = coverRect(w, h, dw, dh);
        expect(r.x).toBeLessThanOrEqual(1e-6);
        expect(r.y).toBeLessThanOrEqual(1e-6);
        expect(r.x + r.width).toBeGreaterThanOrEqual(dw - 1e-6);
        expect(r.y + r.height).toBeGreaterThanOrEqual(dh - 1e-6);
      }
    }
  });
});
