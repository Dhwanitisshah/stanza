import "server-only";
import { MOOD_IDS, type MoodId } from "@/lib/moods/ids";
import type { PublicLine, PublicProsody, PublicStanza, PublicWord } from "@/lib/prosody";
import type { Analysis } from "./schema";
import { firstLineFragment } from "./title";

// Deterministic stand-in for Gemini: same poem in, same analysis out. No network, no randomness.

const LEXICON: Record<MoodId, string[]> = {
  Tender: ["love", "heart", "soft", "gentle", "warm", "kiss", "hold", "dear", "sweet", "home", "hush", "quiet", "lamp", "kettle", "lullaby", "cradle", "tender", "hum", "mother", "child"],
  Melancholy: ["rain", "grey", "gray", "lonely", "alone", "tear", "cry", "gone", "lost", "fade", "autumn", "cold", "shadow", "empty", "sorrow", "grief", "goodbye", "mourn", "dusk", "ache"],
  Defiant: ["fight", "rise", "burn", "never", "break", "loud", "fire", "rage", "stand", "war", "defy", "strong", "scream", "refuse", "anger", "angry", "wrath", "blood", "storm", "wall"],
  Joyful: ["joy", "laugh", "dance", "sun", "sunshine", "bright", "sing", "song", "golden", "smile", "happy", "celebrate", "bloom", "spring", "delight", "play", "glad", "morning", "daffodil", "giggle"],
  Reverent: ["god", "holy", "sacred", "prayer", "pray", "heaven", "soul", "eternal", "divine", "temple", "hymn", "grace", "bless", "spirit", "star", "moon", "silence", "stillness", "altar", "psalm"],
  Restless: ["run", "road", "wind", "fast", "hurry", "restless", "wander", "city", "traffic", "night", "rush", "spin", "chase", "street", "wild", "train", "signal", "engine", "leave", "wheel"],
};

const DEFAULT_MOOD: MoodId = "Tender";

const READINGS: Record<MoodId, string> = {
  Tender: "A quiet, close poem that holds its feeling gently.",
  Melancholy: "A wistful poem that lingers on what has faded or gone.",
  Defiant: "A charged poem that pushes back and refuses to be quiet.",
  Joyful: "A bright poem that delights in the moment it describes.",
  Reverent: "A hushed poem that looks upward with something close to awe.",
  Restless: "A restless poem that keeps moving and never quite settles.",
};

const allWords = (prosody: PublicProsody): PublicWord[] =>
  prosody.stanzas.flatMap((s) => s.lines.flatMap((l) => l.words));

/** "lights" matches "light", "dances" matches "dance": strip a plural/verb -s or -es. */
function stems(word: string): string[] {
  const w = word.toLowerCase();
  return [w, w.replace(/(es|s)$/, "")];
}

function scoreMoods(prosody: PublicProsody): Record<MoodId, number> {
  const score = Object.fromEntries(MOOD_IDS.map((m) => [m, 0])) as Record<MoodId, number>;
  for (const word of allWords(prosody)) {
    const forms = stems(word.core);
    for (const mood of MOOD_IDS) {
      if (LEXICON[mood].some((k) => forms.includes(k))) score[mood] += 1;
    }
  }
  return score;
}

/** Highest keyword count wins; ties go to the earlier mood in MOOD_IDS; no hits -> Tender. */
function pickMood(score: Record<MoodId, number>): { mood: MoodId; hits: number } {
  let best: MoodId = DEFAULT_MOOD;
  let hits = 0;
  for (const mood of MOOD_IDS) {
    if (score[mood] > hits) {
      best = mood;
      hits = score[mood];
    }
  }
  return { mood: best, hits };
}

/** A content word is one that still carries a stress after function words were demoted to 0. */
const isContentWord = (word: PublicWord) => /[12]/.test(word.stress);

/** The last content word of a line ("the moon at last" -> "moon"), or undefined if there is none. */
function lineFinalContentWord(words: PublicWord[]): PublicWord | undefined {
  for (let i = words.length - 1; i >= 0; i--) if (isContentWord(words[i])) return words[i];
  return undefined;
}

/**
 * How strongly a line carries the poem: 2 points per word from the winning mood's lexicon,
 * plus 1 if the line ends a rhyme. Used to pick the one line per stanza that gets emphasis.
 */
function lineStrength(line: PublicLine, mood: MoodId): number {
  const keywords = LEXICON[mood];
  const hits = line.words.filter((w) => stems(w.core).some((form) => keywords.includes(form))).length;
  return 2 * hits + (line.rhymeLetter === "X" ? 0 : 1);
}

/**
 * At most one emphasised word per stanza: the line-final content word of its strongest line.
 * Ties go to the line whose final content word is longer, then to the earlier line.
 */
function emphasisWordOfStanza(stanza: PublicStanza, mood: MoodId): PublicWord | undefined {
  let best: { word: PublicWord; strength: number } | undefined;
  for (const line of stanza.lines) {
    const word = lineFinalContentWord(line.words);
    if (!word) continue;
    const strength = lineStrength(line, mood);
    const better =
      !best || strength > best.strength || (strength === best.strength && word.core.length > best.word.core.length);
    if (better) best = { word, strength };
  }
  return best?.word;
}

/** Small stable hash (djb2) so the same poem always picks the same palette variant. */
function paletteVariantFor(prosody: PublicProsody): number {
  let hash = 5381;
  for (const word of allWords(prosody)) {
    for (const ch of word.core.toLowerCase()) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
  }
  return hash % 3;
}

export function fallbackAnalysis(prosody: PublicProsody): Analysis {
  const { mood, hits } = pickMood(scoreMoods(prosody));
  const emphasis = prosody.stanzas
    .map((stanza) => emphasisWordOfStanza(stanza, mood)?.id)
    .filter((id): id is string => id !== undefined);

  return {
    mood,
    intensity: Math.min(1, Math.round((0.4 + 0.15 * hits) * 100) / 100),
    emphasis,
    title: firstLineFragment(prosody),
    paletteVariant: paletteVariantFor(prosody),
    reading: READINGS[mood],
  };
}

/** The generic one-sentence reading for a mood (used when Gemini's reading is empty). */
export const readingFor = (mood: MoodId): string => READINGS[mood];
