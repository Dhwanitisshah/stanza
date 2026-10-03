import "server-only";
import type { PublicProsody } from "@/lib/prosody";
import { readingFor } from "./fallback";
import type { Analysis } from "./schema";
import { firstLineFragment, isTitleFromPoem } from "./title";

const MAX_EMPHASIS_PER_LINE = 2;
const MAX_READING_CHARS = 240;

/** Keep only real word ids, no duplicates, at most 2 per line (first ones win). */
function cleanEmphasis(ids: string[], prosody: PublicProsody): string[] {
  const lineOf = new Map<string, number>();
  for (const stanza of prosody.stanzas)
    for (const line of stanza.lines) for (const word of line.words) lineOf.set(word.id, line.index);

  const perLine = new Map<number, number>();
  const kept = new Set<string>();
  for (const id of ids) {
    const line = lineOf.get(id);
    if (line === undefined || kept.has(id)) continue;
    const count = perLine.get(line) ?? 0;
    if (count >= MAX_EMPHASIS_PER_LINE) continue;
    perLine.set(line, count + 1);
    kept.add(id);
  }
  return [...kept];
}

/**
 * Gemini's output already matches the schema; this checks it against the actual poem.
 * Nothing the model says can put new words into the poster.
 */
export function sanitizeAnalysis(analysis: Analysis, prosody: PublicProsody): Analysis {
  const title = analysis.title.trim();
  const reading = analysis.reading.trim().slice(0, MAX_READING_CHARS);
  return {
    ...analysis,
    emphasis: cleanEmphasis(analysis.emphasis, prosody),
    title: isTitleFromPoem(title, prosody) ? title : firstLineFragment(prosody),
    reading: reading || readingFor(analysis.mood),
  };
}
