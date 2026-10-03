import { readFileSync } from "node:fs";

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

// Public domain (pre-1929).
export const ABAB = read("abab-wordsworth.txt"); // Wordsworth, 1807 -> ABABCC
export const AABB = read("aabb-blake.txt"); // Blake, 1794 -> AABB
export const FREE_VERSE = read("free-verse-whitman.txt"); // Whitman, 1855 -> no end rhymes

// Originals from TESTING.md.
export const LAMP_ABAB = read("abab-lamp.txt"); // door/floor, tune/moon -> ABAB
export const LETTERS_AABB = read("aabb-letters.txt"); // small/wall, old/cold -> AABB
export const TRAFFIC_FREE_VERSE = read("free-verse-traffic.txt"); // no end rhymes

/** Inputs that must never make the prosody engine throw. */
export const EDGE_CASES: Record<string, string> = {
  empty: "",
  whitespaceOnly: "  \n\t \n   ",
  punctuationOnly: "... --- !?!\n\n,,,",
  singleWord: "Hello",
  singlePunctuatedWord: "“Hello,”",
  numbers: "1984 and 2001 were 3 years apart",
  emoji: "love ❤️ is everything 🌹",
  accents: "café naïve façade",
  allCaps: "THE QUICK BROWN FOX",
  crlf: "line one\r\nline two\r\n\r\nline three",
  manyBlankLines: "a\n\n\n\n\nb\n\n\n",
  dashes: "wait—what—no -- yes - maybe\n—\nend",
  hyphenated: "a well-known, sun-drenched, never-ending road",
  apostrophes: "O’er the hills, 'tis don't can't ne'er heav'n singin' the moon's glow",
  gibberish: "asdfgh qwertz zxcvbn blorptastic",
  weirdSymbols: "<script>alert(1)</script> {} [] \\ / | ~ ` @ # $ % ^ & *",
  constructorWord: "constructor __proto__ hasOwnProperty toString",
  longLine: "word ".repeat(2000),
  manyLines: Array.from({ length: 300 }, (_, i) => `line ${i} of the poem`).join("\n"),
  // From TESTING.md:
  seaEmoji: "the sea 🌊 keeps its promises",
  unknownWords: "Pimpri chai wallah",
  trailingSpacesAndBlanks: "line one   \n\n\n  line two  \n   \nline three\t\n\n",
  fortyOneLines: Array.from({ length: 41 }, (_, i) => `line ${i}`).join("\n"),
  veryLongWord: "a".repeat(5000),
};
