// PURE: the arithmetic and the checks behind the photo background. The decoding itself (browser only) is in image.ts.

/** The export sizes a photo must be able to cover. The Reel is the taller, so covering it covers the Post too. */
export const COVER_TARGET = { width: 1080, height: 1920 } as const;

export const IMAGE_LIMITS = {
  maxBytes: 40 * 1024 * 1024,
  maxPixels: 200_000_000,
} as const;

export const MESSAGES = {
  unsupported: "That image format isn't supported by this browser. Try a JPG, PNG or WebP.",
  heic: "HEIC photos (the iPhone default) can't be opened here. Export it as a JPG first, or share it from Photos as \"Most Compatible\".",
  notAnImage: "That doesn't look like an image. Choose a JPG, PNG or WebP.",
  tooBig: `That photo is larger than ${IMAGE_LIMITS.maxBytes / 1024 / 1024} MB. Try a smaller one.`,
  tooManyPixels: "That photo has too many pixels to open safely. Try a smaller version of it.",
} as const;

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
const HEIC = /(heic|heif)/i;

/** Quick checks on the file itself, before spending time decoding it. Returns a friendly message, or null if it may be fine. */
export function imageFileProblem(file: { name: string; type: string; size: number }): string | null {
  if (HEIC.test(file.type) || /\.(heic|heif)$/i.test(file.name)) return MESSAGES.heic;
  if (file.size > IMAGE_LIMITS.maxBytes) return MESSAGES.tooBig;
  const looksLikeImage = file.type.startsWith("image/") || IMAGE_EXTENSIONS.test(file.name);
  if (!looksLikeImage) return MESSAGES.notAnImage;
  return null;
}

/**
 * The size to keep a photo at: no bigger than needed to cover the biggest export, and never enlarged.
 * A 6000 x 4000 photo becomes 2880 x 1920; a small photo is left alone (it is upscaled when drawn).
 */
export function downscaledSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, Math.max(COVER_TARGET.width / width, COVER_TARGET.height / height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Where to draw a source of srcW x srcH so that it covers dstW x dstH: scaled to fill, centred, the overflow cropped. */
export function coverRect(srcW: number, srcH: number, dstW: number, dstH: number): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return { x: (dstW - width) / 2, y: (dstH - height) / 2, width, height };
}
