// Browser only: the finished poster of one page as PNG or JPEG, drawn by the same renderer as the preview.
import { prepareResources } from "@/lib/render/browser";
import type { ImageAsset } from "@/lib/render/image";
import { renderPoster } from "@/lib/render/renderFrame";
import type { Scene } from "@/lib/render/types";

export type StillType = "image/png" | "image/jpeg";
export const JPEG_QUALITY = 0.92;
export const STILL_EXTENSION = { "image/png": "png", "image/jpeg": "jpg" } as const;

export async function exportStill(scene: Scene, image: ImageAsset | null, page: number, type: StillType): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = scene.layout.width;
  canvas.height = scene.layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the poster for export.");
  renderPoster(ctx, scene, page, prepareResources(scene, image));
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The browser couldn't make that image."))), type, type === "image/jpeg" ? JPEG_QUALITY : undefined);
  });
}
