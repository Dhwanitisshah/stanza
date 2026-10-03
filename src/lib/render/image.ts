// Browser only: decoding the user's photo. It happens once, in the browser, and the image never leaves it:
// it is not uploaded, and it is not part of a share link.
import { coverRect, downscaledSize, IMAGE_LIMITS, imageFileProblem, MESSAGES } from "./imageFit";
import { averageLuminance } from "./styling";

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type AnyContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A decoded photo, kept at a sensible size, with how bright it is. */
export interface ImageAsset {
  name: string;
  /** Size of the kept (downscaled) image. */
  width: number;
  height: number;
  canvas: AnyCanvas;
  /** Average brightness 0..1, used to choose light or dark text. */
  luminance: number;
}

/** An error whose message is meant for the user. */
export class ImageProblem extends Error {}

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

const contextOf = (canvas: AnyCanvas): AnyContext => {
  const context = canvas.getContext("2d") as AnyContext | null;
  if (!context) throw new ImageProblem("This browser can't draw images on a canvas.");
  return context;
};

/** Decode with the photo's own orientation (phones store photos sideways plus a rotation flag). */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // An older browser may not know the option; try plainly before giving up.
    try {
      return await createImageBitmap(file);
    } catch {
      throw new ImageProblem(MESSAGES.unsupported);
    }
  }
}

export async function loadImageAsset(file: File): Promise<ImageAsset> {
  const problem = imageFileProblem(file);
  if (problem) throw new ImageProblem(problem);

  const bitmap = await decode(file);
  try {
    if (bitmap.width * bitmap.height > IMAGE_LIMITS.maxPixels) throw new ImageProblem(MESSAGES.tooManyPixels);

    const { width, height } = downscaledSize(bitmap.width, bitmap.height);
    const canvas = makeCanvas(width, height);
    const context = contextOf(canvas);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    // Brightness from a tiny copy: 24 x 24 pixels is plenty for an average.
    const sample = makeCanvas(24, 24);
    const sampleContext = contextOf(sample);
    sampleContext.drawImage(canvas, 0, 0, 24, 24);
    const luminance = averageLuminance(sampleContext.getImageData(0, 0, 24, 24).data);

    return { name: file.name, width, height, canvas, luminance };
  } finally {
    bitmap.close(); // the full-size pixels are no longer needed
  }
}

const coverCache = new WeakMap<object, Map<string, AnyCanvas>>();

/** The photo drawn to fill width x height (centred, cropped), once per size. */
export function coverCanvas(asset: ImageAsset, width: number, height: number): AnyCanvas {
  const perSize = coverCache.get(asset) ?? new Map<string, AnyCanvas>();
  coverCache.set(asset, perSize);
  const key = `${width}x${height}`;
  const cached = perSize.get(key);
  if (cached) return cached;

  const canvas = makeCanvas(width, height);
  const context = contextOf(canvas);
  context.imageSmoothingQuality = "high";
  const rect = coverRect(asset.width, asset.height, width, height);
  context.drawImage(asset.canvas, rect.x, rect.y, rect.width, rect.height);
  perSize.set(key, canvas);
  return canvas;
}
