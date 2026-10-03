// Per-word stress pattern: one digit per syllable. 0 = unstressed, 1 = primary, 2 = secondary.
import { isVowel, type Phonemes } from "./syllables";

/**
 * Small words CMU marks as stressed (it lists them in isolation) but that
 * we skim over when speaking a line aloud. Only applied to one-syllable words.
 */
const FUNCTION_WORDS = new Set([
  "the", "a", "an", "of", "to", "and", "in", "on", "at", "is", "it", "for", "with",
  "but", "or", "as", "my", "your", "his", "her", "its", "our", "their", "by", "from",
  "be", "am", "are", "was", "were", "i", "me", "we", "he", "she", "you", "they",
  "him", "them", "us", "nor", "if", "than", "so",
]);

export function isFunctionWord(core: string): boolean {
  return FUNCTION_WORDS.has(core.toLowerCase());
}

/** Read the stress digits off the vowel phonemes: ["D","AO1","R"] -> "1". */
export function stressFromPhonemes(phonemes: Phonemes): string {
  return phonemes
    .filter(isVowel)
    .map((p) => p.slice(-1))
    .join("");
}

/** Heuristic words get stress on the first syllable: 3 syllables -> "100". */
export function heuristicStress(syllables: number): string {
  return "1" + "0".repeat(Math.max(0, syllables - 1));
}

/** Demote one-syllable function words to unstressed ("0") so timing sounds like speech. */
export function demoteFunctionWord(core: string, stress: string): string {
  return stress.length === 1 && isFunctionWord(core) ? "0" : stress;
}
