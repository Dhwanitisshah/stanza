import "server-only";
import { MOOD_IDS, type MoodId } from "@/lib/moods/ids";
import type { PublicProsody, PublicWord } from "@/lib/prosody";
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

/** The longest word that carries a stress (function words are already demoted to 0). */
function emphasisWordOf(words: PublicWord[]): PublicWord | undefined {
  let best: PublicWord | undefined;
  for (const word of words) {
    if (!/[12]/.test(word.stress)) continue;
    if (!best || word.core.length > best.core.length) best = word;
  }
  return best;
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
    .flatMap((s) => s.lines)
    .map((line) => emphasisWordOf(line.words)?.id)
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
