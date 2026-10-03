import "server-only";
import type { PublicProsody } from "@/lib/prosody";
import { isFunctionWord } from "@/lib/prosody/stress";

// A title here is only ever a SUGGESTION. The poster shows a title only when the user sets or accepts one.

const MAX_TITLE_WORDS = 6;
const MAX_SUGGESTION_WORDS = 4;

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

const DETERMINERS = new Set(["a", "an", "the", "my", "our", "your", "this", "that"]);
/** Small words that stay lowercase in the middle of a Title Case title. */
const MINOR_WORDS = new Set(["a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or", "but", "as", "by", "with", "from", "nor"]);

function titleCase(words: string[]): string {
  const capitalise = (word: string) =>
    word
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("-");
  return words.map((word, i) => (i > 0 && i < words.length - 1 && MINOR_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : capitalise(word))).join(" ");
}

/** "a patient moon and" -> "a patient moon": a title never ends on a function word. */
function trimTrailingFunctionWords(words: string[]): string[] {
  const kept = [...words];
  while (kept.length > 0 && isFunctionWord(kept[kept.length - 1])) kept.pop();
  return kept;
}

/**
 * The closing phrase of the poem's last line: from its last article or determiner (a, an, the, my, our, your,
 * this, that), else its last 3 words; at most 4 words; Title Case; never ending on a function word.
 * Returns null when nothing usable is left (for example a last line made only of function words).
 * "and somewhere far, a patient moon." -> "A Patient Moon"
 */
export function suggestTitle(prosody: PublicProsody): string | null {
  const lines = prosody.stanzas.flatMap((s) => s.lines);
  const last = lines[lines.length - 1];
  if (!last) return null;

  const words = last.words.map((w) => w.core.replace(/^'+|'+$/g, "")).filter(Boolean);
  const lastThree = words.slice(-3);
  const determiner = words.findLastIndex((w) => DETERMINERS.has(w.toLowerCase()));
  const candidates = determiner >= 0 ? [words.slice(determiner), lastThree] : [lastThree];

  for (const candidate of candidates) {
    const phrase = trimTrailingFunctionWords(candidate.slice(-MAX_SUGGESTION_WORDS));
    if (phrase.length > 0) return titleCase(phrase);
  }
  return null;
}
