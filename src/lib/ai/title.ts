import "server-only";
import type { PublicProsody } from "@/lib/prosody";

const MAX_TITLE_WORDS = 6;

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);

/** Every word (and hyphen-part) that appears in the poem, lowercased. */
function poemVocabulary(prosody: PublicProsody): Set<string> {
  const vocab = new Set<string>();
  for (const stanza of prosody.stanzas)
    for (const line of stanza.lines)
      for (const word of line.words) {
        const core = word.core.toLowerCase();
        vocab.add(core);
        for (const part of core.split("-")) vocab.add(part);
      }
  return vocab;
}

/** True only if the title is 1-6 words and every one of them appears in the poem. */
export function isTitleFromPoem(title: string, prosody: PublicProsody): boolean {
  const words = wordsOf(title);
  if (words.length === 0 || words.length > MAX_TITLE_WORDS) return false;
  const vocab = poemVocabulary(prosody);
  return words.every((w) => vocab.has(w));
}

/** The first few words of the first line, with trailing punctuation removed. */
export function firstLineFragment(prosody: PublicProsody): string {
  const first = prosody.stanzas[0]?.lines[0]?.words ?? [];
  return first
    .slice(0, MAX_TITLE_WORDS)
    .map((w) => w.core)
    .join(" ");
}
