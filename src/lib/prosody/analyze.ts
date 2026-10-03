// Combines tokenizing, pronunciation, stress and rhyme into one ProsodyResult.
import { detectScheme, type RhymeGroup, type RhymePair, type RhymeWord } from "./rhyme";
import { demoteFunctionWord, heuristicStress, stressFromPhonemes } from "./stress";
import { pronounce, type Phonemes } from "./syllables";
import { tokenize, type Token } from "./tokenize";

export interface AnalyzedWord extends Token {
  syllables: number;
  /** One digit per syllable (0/1/2), after function-word demotion. */
  stress: string;
  source: "cmu" | "heuristic";
  /** Every CMU pronunciation (empty when source is "heuristic"). */
  variants: Phonemes[];
}

export interface AnalyzedLine {
  index: number;
  stanzaIndex: number;
  words: AnalyzedWord[];
  syllables: number;
  /** Rhyme letter of this line's end word; "X" if unrhymed. */
  rhymeLetter: string;
}

export interface AnalyzedStanza {
  index: number;
  lines: AnalyzedLine[];
  /** Letters of this stanza's lines, e.g. "ABAB". */
  scheme: string;
}

export interface ProsodyResult {
  stanzas: AnalyzedStanza[];
  /** Letters for the whole poem, continuing across stanzas, e.g. "ABABCDCD". */
  scheme: string;
  rhymeGroups: RhymeGroup[];
  rhymePairs: RhymePair[];
  wordCount: number;
  syllableCount: number;
}

function analyzeWord(token: Token): AnalyzedWord {
  const pron = pronounce(token.core, token.leading, token.trailing);
  const rawStress =
    pron.source === "cmu" ? stressFromPhonemes(pron.variants[0]) : heuristicStress(pron.syllables);
  return {
    ...token,
    syllables: pron.syllables,
    stress: demoteFunctionWord(token.core, rawStress),
    source: pron.source,
    variants: pron.variants,
  };
}

function toRhymeWord(word: AnalyzedWord | undefined): RhymeWord | null {
  return word ? { core: word.core, variants: word.variants } : null;
}

/** Never throws, whatever the input. */
export function analyzePoem(poem: string): ProsodyResult {
  const tokenized = tokenize(poem);

  const stanzas = tokenized.stanzas.map((stanza) => ({
    index: stanza.index,
    lines: stanza.lines.map((line) => {
      const words = line.words.map(analyzeWord);
      return {
        index: line.index,
        stanzaIndex: line.stanzaIndex,
        words,
        syllables: words.reduce((sum, w) => sum + w.syllables, 0),
        rhymeLetter: "X",
      };
    }),
  }));

  const allLines = stanzas.flatMap((s) => s.lines);
  const { letters, groups, pairs } = detectScheme(allLines.map((l) => toRhymeWord(l.words.at(-1))));
  allLines.forEach((line, i) => {
    line.rhymeLetter = letters[i];
  });

  return {
    stanzas: stanzas.map((s) => ({ ...s, scheme: s.lines.map((l) => l.rhymeLetter).join("") })),
    scheme: letters.join(""),
    rhymeGroups: groups,
    rhymePairs: pairs,
    wordCount: allLines.reduce((n, l) => n + l.words.length, 0),
    syllableCount: allLines.reduce((n, l) => n + l.syllables, 0),
  };
}
