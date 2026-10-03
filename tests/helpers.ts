import { fallbackAnalysis } from "@/lib/ai/fallback";
import type { MeasureText } from "@/lib/render/types";
import { analyzePoem, toPublicProsody } from "@/lib/prosody";

/** Fake monospace font: every character is 0.6 em wide. No browser needed. */
export const monospace: MeasureText = (text, font) => {
  const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  return text.length * px * 0.6;
};

export function prepare(poem: string) {
  const prosody = toPublicProsody(analyzePoem(poem));
  const analysis = fallbackAnalysis(prosody);
  return { prosody, analysis };
}

export const wordIds = (prosody: ReturnType<typeof prepare>["prosody"]) =>
  prosody.stanzas.flatMap((s) => s.lines.flatMap((l) => l.words.map((w) => w.id)));
