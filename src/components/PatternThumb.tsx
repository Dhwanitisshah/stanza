"use client";

import { useEffect, useRef } from "react";
import { drawPattern, type PatternId } from "@/lib/render/patterns";

const THUMB_WIDTH = 54;
const THUMB_HEIGHT = 96;

/** A tiny preview of a pattern, drawn with the same code the poster uses, scaled down. */
export function PatternThumb({ id, ink, paper }: { id: PatternId; ink: string; paper: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    context.save();
    context.scale(THUMB_WIDTH / 1080, THUMB_WIDTH / 1080);
    // The thumbnail is stronger than the poster's default so the shape is easy to see.
    drawPattern(context, id, 1080, THUMB_HEIGHT * (1080 / THUMB_WIDTH), 90, ink);
    context.restore();
  }, [id, ink]);

  return <canvas ref={ref} width={THUMB_WIDTH} height={THUMB_HEIGHT} aria-hidden className="h-24 w-[54px] rounded-[3px] border border-rule" style={{ background: paper }} />;
}
