// Pronunciation lookup: CMU Pronouncing Dictionary first, `syllable` heuristic as fallback.
import { dictionary } from "cmu-pronouncing-dictionary";
import { syllable } from "syllable";

export type Phonemes = string[]; // e.g. ["D", "AO1", "R"]

export interface Pronunciation {
  /** All CMU pronunciations. The first one is used for syllables and stress. Empty for heuristic words. */
  variants: Phonemes[];
  syllables: number;
  source: "cmu" | "heuristic";
}

/** Poetic elisions CMU doesn't know, mapped to the full word it sounds like. */
const ELISIONS: Record<string, string> = {
  "o'er": "over",
  "e'er": "ever",
  "e'en": "even",
  "heav'n": "heaven",
  "ev'ry": "every",
  "pow'r": "power",
  "flow'r": "flower",
  "th'": "the",
};

export function isVowel(phoneme: string): boolean {
  return /\d$/.test(phoneme);
}

function entry(key: string): string | undefined {
  // hasOwn guards against keys like "constructor" hitting Object.prototype.
  return Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
}

/** CMU lists alternatives as "read", "read(2)", "read(3)"... Collect them all. */
function variantsOf(key: string): Phonemes[] {
  const variants: Phonemes[] = [];
  const first = entry(key);
  if (first === undefined) return variants;
  variants.push(first.split(" "));
  for (let n = 2; ; n++) {
    const next = entry(`${key}(${n})`);
    if (next === undefined) break;
    variants.push(next.split(" "));
  }
  return variants;
}

/** Try the spellings a poet might use: with edge apostrophes ('tis, singin'), elisions, possessives. */
function lookupSingle(core: string, leading: string, trailing: string): Phonemes[] {
  const word = core.toLowerCase();
  const candidates = [word];
  if (leading.includes("'")) candidates.push(`'${word}`);
  if (trailing.startsWith("'")) candidates.push(`${word}'`);

  for (const key of candidates) {
    const found = variantsOf(key);
    if (found.length) return found;
  }

  const elided = ELISIONS[word];
  if (elided) return variantsOf(elided);

  // "moon's" not in the dictionary: use "moon" + a Z sound (no extra syllable; fine for poetry timing).
  if (word.endsWith("'s")) {
    return variantsOf(word.slice(0, -2)).map((v) => [...v, "Z"]);
  }
  const noApostrophes = word.replace(/'/g, "");
  return noApostrophes !== word ? variantsOf(noApostrophes) : [];
}

/** "well-known" is in CMU as-is; otherwise look up each part and join them. */
function lookupVariants(core: string, leading: string, trailing: string): Phonemes[] {
  const whole = lookupSingle(core, leading, trailing);
  if (whole.length || !core.includes("-")) return whole;

  const parts = core.split("-").filter(Boolean);
  const partVariants = parts.map((p, i) =>
    lookupSingle(p, i === 0 ? leading : "", i === parts.length - 1 ? trailing : ""),
  );
  if (partVariants.length === 0 || partVariants.some((v) => v.length === 0)) return [];

  const prefix = partVariants.slice(0, -1).flatMap((v) => v[0]);
  const last = partVariants[partVariants.length - 1];
  return last.map((v) => [...prefix, ...v]); // every variant of the final part keeps rhyme matching honest
}

function heuristicCount(core: string): number {
  return Math.max(1, syllable(core));
}

/** Never throws. Always returns at least one syllable for a non-empty word. */
export function pronounce(core: string, leading = "", trailing = ""): Pronunciation {
  const variants = lookupVariants(core, leading, trailing);
  const vowelCount = variants.length ? variants[0].filter(isVowel).length : 0;
  if (vowelCount > 0) return { variants, syllables: vowelCount, source: "cmu" };
  return { variants: [], syllables: heuristicCount(core), source: "heuristic" };
}
