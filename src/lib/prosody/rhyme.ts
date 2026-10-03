// Rhyme detection on line-end words only (internal rhymes are out of scope).
import { isVowel, type Phonemes } from "./syllables";

export type RhymeStrength = "perfect" | "near" | "repeat";

/** What the rhyme matcher needs to know about a line's last word. */
export interface RhymeWord {
  core: string;
  /** All CMU pronunciations; empty for heuristic words (they can only "repeat"). */
  variants: Phonemes[];
}

export interface RhymePair {
  a: number; // line index, a < b
  b: number;
  strength: RhymeStrength;
}

export interface RhymeGroup {
  letter: string;
  lines: number[];
}

export interface SchemeResult {
  /** One letter per line; "X" marks an unrhymed line. */
  letters: string[];
  groups: RhymeGroup[];
  pairs: RhymePair[];
}

const UNRHYMED = "X";

/** Consonant classes for near rhymes. Voicing is deliberately ignored (T ~ D, S ~ Z). */
const CONSONANT_CLASS: Record<string, string> = {
  M: "nasal", N: "nasal", NG: "nasal",
  P: "stop", T: "stop", K: "stop", B: "stop", D: "stop", G: "stop",
  F: "fricative", V: "fricative", TH: "fricative", DH: "fricative",
  S: "fricative", Z: "fricative", SH: "fricative", ZH: "fricative", HH: "fricative",
  CH: "affricate", JH: "affricate",
  L: "liquid", R: "liquid",
  W: "glide", Y: "glide",
};

const stripStress = (p: string) => p.replace(/\d$/, "");

/** Phonemes from the last stressed vowel (digit 1 or 2) to the end; last vowel if none is stressed. */
export function rhymeTail(phonemes: Phonemes): Phonemes {
  let start = -1;
  for (let i = phonemes.length - 1; i >= 0; i--) {
    if (/[12]$/.test(phonemes[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) start = phonemes.findLastIndex(isVowel);
  return start === -1 ? [] : phonemes.slice(start);
}

function sameTail(a: Phonemes, b: Phonemes): boolean {
  return a.length === b.length && a.every((p, i) => stripStress(p) === stripStress(b[i]));
}

/** Same vowels, and each consonant in the same class: time (M) ~ mine (N). */
function nearTail(a: Phonemes, b: Phonemes): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  return a.every((p, i) => {
    const q = b[i];
    if (isVowel(p) || isVowel(q)) return isVowel(p) && isVowel(q) && stripStress(p) === stripStress(q);
    return stripStress(p) === stripStress(q) || (CONSONANT_CLASS[p] !== undefined && CONSONANT_CLASS[p] === CONSONANT_CLASS[q]);
  });
}

const normalize = (core: string) => core.toLowerCase().replace(/'/g, "");

/** Strength of the rhyme between two words, or null. Identical words are a "repeat", never a rhyme. */
export function compareWords(a: RhymeWord, b: RhymeWord): RhymeStrength | null {
  if (normalize(a.core) === normalize(b.core)) return "repeat";

  const tailsA = a.variants.map(rhymeTail);
  const tailsB = b.variants.map(rhymeTail);
  let near = false;
  for (const ta of tailsA) {
    for (const tb of tailsB) {
      if (sameTail(ta, tb)) return "perfect";
      if (nearTail(ta, tb)) near = true;
    }
  }
  return near ? "near" : null;
}

/** A, B, C... skipping X; past 25 groups: A2, B2... */
function letterFor(groupNumber: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWYZ";
  const round = Math.floor(groupNumber / alphabet.length);
  return alphabet[groupNumber % alphabet.length] + (round ? String(round + 1) : "");
}

/** `endWords[i]` is the last word of line i, or null if the line has none. */
export function detectScheme(endWords: (RhymeWord | null)[]): SchemeResult {
  // 1. Group lines: join the first group containing a rhyming member, else start a new one.
  const rawGroups: number[][] = [];
  endWords.forEach((word, line) => {
    if (!word) return;
    const home = rawGroups.find((members) =>
      members.some((m) => compareWords(endWords[m] as RhymeWord, word) !== null),
    );
    if (home) home.push(line);
    else rawGroups.push([line]);
  });

  // 2. Only groups with 2+ lines are rhymes; letters follow first appearance.
  const groups: RhymeGroup[] = rawGroups
    .filter((members) => members.length > 1)
    .map((lines, i) => ({ letter: letterFor(i), lines }));

  const letters = endWords.map(() => UNRHYMED);
  const pairs: RhymePair[] = [];
  for (const group of groups) {
    for (const line of group.lines) letters[line] = group.letter;
    for (let i = 0; i < group.lines.length; i++) {
      for (let j = i + 1; j < group.lines.length; j++) {
        const a = group.lines[i];
        const b = group.lines[j];
        const strength = compareWords(endWords[a] as RhymeWord, endWords[b] as RhymeWord);
        // Chained members (A~B, B~C) may not rhyme directly; skip those pairs.
        if (strength) pairs.push({ a, b, strength });
      }
    }
  }
  return { letters, groups, pairs };
}
