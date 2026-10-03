// Splits raw poem text into stanzas -> lines -> words.
// Punctuation stays attached to its word (leading/trailing) because Phase 3 uses it for pauses.

export interface Token {
  id: string; // stable, e.g. "w12"
  index: number; // position in the whole poem
  stanzaIndex: number;
  lineIndex: number; // position in the whole poem (not per stanza)
  wordIndex: number; // position within its line
  text: string; // as written, punctuation included
  leading: string; // punctuation before the word, e.g. an opening quote
  core: string; // the word itself, e.g. "don't", "well-known"
  trailing: string; // punctuation after the word, e.g. ",", "—"
}

export interface TokenizedLine {
  index: number;
  stanzaIndex: number;
  words: Token[];
}

export interface TokenizedStanza {
  index: number;
  lines: TokenizedLine[];
}

export interface TokenizedPoem {
  stanzas: TokenizedStanza[];
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const EDGES = /^([^\p{L}\p{N}]*)([\s\S]*?)([^\p{L}\p{N}]*)$/u;

/** Curly quotes -> straight, so "o’er" and "o'er" are the same word. */
function normalizeQuotes(s: string): string {
  return s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
}

/** Split a line on whitespace, and also after dashes: "end—and" -> "end—", "and". */
function chunksOfLine(line: string): string[] {
  return normalizeQuotes(line)
    .replace(/(--+|[—–])/g, "$1 ")
    .split(/\s+/)
    .filter(Boolean);
}

function splitEdges(chunk: string): { leading: string; core: string; trailing: string } {
  const match = EDGES.exec(chunk);
  // The regex always matches; the fallback only satisfies the type checker.
  const [, leading = "", core = "", trailing = ""] = match ?? [];
  return { leading, core, trailing };
}

/** Words of one line. Punctuation-only chunks get glued onto a neighbouring word. */
function wordsOfLine(line: string): { leading: string; core: string; trailing: string; text: string }[] {
  const words: { leading: string; core: string; trailing: string; text: string }[] = [];
  let pendingLeading = "";

  for (const chunk of chunksOfLine(line)) {
    if (!LETTER_OR_DIGIT.test(chunk)) {
      const last = words[words.length - 1];
      if (last) {
        last.trailing += chunk;
        last.text += chunk;
      } else {
        pendingLeading += chunk;
      }
      continue;
    }
    const { leading, core, trailing } = splitEdges(chunk);
    words.push({ leading: pendingLeading + leading, core, trailing, text: pendingLeading + chunk });
    pendingLeading = "";
  }
  return words;
}

/** Blank lines separate stanzas; lines with no words are dropped. Never throws. */
export function tokenize(poem: string): TokenizedPoem {
  const rawLines = (poem ?? "").replace(/\r\n?/g, "\n").split("\n");
  const stanzas: TokenizedStanza[] = [];

  let currentLines: string[] = [];
  const stanzaTexts: string[][] = [];
  const flush = () => {
    if (currentLines.length) stanzaTexts.push(currentLines);
    currentLines = [];
  };
  for (const raw of rawLines) {
    if (raw.trim() === "") flush();
    else currentLines.push(raw);
  }
  flush();

  let lineIndex = 0;
  let tokenIndex = 0;
  for (const lineTexts of stanzaTexts) {
    const stanzaIndex = stanzas.length;
    const lines: TokenizedLine[] = [];
    for (const lineText of lineTexts) {
      const parts = wordsOfLine(lineText);
      if (parts.length === 0) continue;
      const words: Token[] = parts.map((p, wordIndex) => ({
        id: `w${tokenIndex}`,
        index: tokenIndex++,
        stanzaIndex,
        lineIndex,
        wordIndex,
        ...p,
      }));
      lines.push({ index: lineIndex++, stanzaIndex, words });
    }
    if (lines.length) stanzas.push({ index: stanzaIndex, lines });
  }
  return { stanzas };
}
