// Every timing knob in one place. Pauses are measured in BEATS (one beat = mood.beatMs / speed),
// so they stretch with speed and mood. Fixed times (lead-in, final hold, transitions) are in ms.

export const TIMING = {
  /** Silence before the first word. */
  leadInMs: 500,

  /** Duration of a syllable relative to one beat, by stress digit from the prosody engine. */
  stressedMultiplier: 1.4, // stress 1
  secondaryMultiplier: 1.2, // stress 2
  unstressedMultiplier: 1, // stress 0

  /** Extra time an AI-chosen emphasis word keeps the floor before the next word. */
  emphasisHoldBeats: 1.5,

  /**
   * Pauses after a word, in beats. They ADD: a line ending in a period waits `long + line`.
   * A stanza break replaces the line break (it does not stack on it).
   * Keep them ordered: comma < medium < long < line < stanza (a test enforces this).
   */
  pauseBeats: {
    comma: 0.5, // ,
    medium: 1.0, // ; : and dashes
    long: 1.5, // . ? ! and ellipses
    line: 2.0, // end of a line
    stanza: 4.0, // end of a stanza
  },

  /** The stanza that just ended dims to this opacity, over this long. */
  stanzaDimTo: 0.35,
  stanzaDimMs: 700,

  /** How long a rhyme echo pulse lasts. */
  echoMs: 600,

  /** Time the old page takes to clear before the next page starts. */
  pageTransitionMs: 600,

  /** The finished poster stays on screen this long. */
  finalHoldMs: 2500,

  /** Speed is clamped to this range; anything else (NaN, 0, negative) becomes 1. */
  minSpeed: 0.25,
  maxSpeed: 4,
} as const;

export type PauseKind = keyof typeof TIMING.pauseBeats;
