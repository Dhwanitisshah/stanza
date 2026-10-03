// PURE: (prosody, analysis, mood, speed) -> a list of timed events. No DOM, no randomness, integer ms.
import type { Analysis } from "@/lib/ai/schema";
import type { MoodPreset } from "@/lib/moods/types";
import type { PublicProsody, PublicWord } from "@/lib/prosody";
import type { AppearEvent, EchoEvent, FooterEvent, PageEvent, StanzaDimEvent, Timeline, TimelineEvent } from "@/lib/render/types";
import { TIMING, type PauseKind } from "./config";

/** Strongest punctuation wins: "!)" is long, ',"' is a comma. */
export function punctuationPause(trailing: string): PauseKind | null {
  if (/[.?!…]/.test(trailing)) return "long";
  if (/[;:—–-]/.test(trailing)) return "medium";
  if (trailing.includes(",")) return "comma";
  return null;
}

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 1;
  return Math.min(TIMING.maxSpeed, Math.max(TIMING.minSpeed, speed));
}

function syllableMultiplier(digit: string): number {
  if (digit === "1") return TIMING.stressedMultiplier;
  if (digit === "2") return TIMING.secondaryMultiplier;
  return TIMING.unstressedMultiplier;
}

/** How long a word is spoken: one beat per syllable, longer for stressed ones. */
export function spokenBeats(word: Pick<PublicWord, "stress" | "syllables">): number {
  const digits = word.stress.length ? word.stress.split("") : Array(word.syllables).fill("0");
  return digits.reduce((sum, digit) => sum + syllableMultiplier(digit), 0);
}

export interface TimelineOptions {
  /** Extra time the finished poster holds, on top of the standard final hold (from the length control). */
  extraHoldMs?: number;
  /** false drops the rhyme echoes. Default true. */
  echoes?: boolean;
  /** A title is shown above the poem: it fades in first and the first word waits for it. */
  title?: boolean;
}

/**
 * @param pageOfLine page index of each line (from the layout). Omit for a single page.
 */
export function buildTimeline(
  prosody: PublicProsody,
  analysis: Pick<Analysis, "emphasis">,
  mood: MoodPreset,
  speed: number,
  pageOfLine: number[] = [],
  options: TimelineOptions = {},
): Timeline {
  const { extraHoldMs = 0, echoes = true, title = false } = options;
  const beat = mood.beatMs / clampSpeed(speed);
  const ms = (beats: number) => Math.round(beats * beat);
  const emphasised = new Set(analysis.emphasis);

  const lines = prosody.stanzas.flatMap((stanza) => stanza.lines);
  const events: TimelineEvent[] = [];
  const startOf = new Map<string, number>();
  const endWordOfLine = new Map<number, string>();

  let cursor: number = TIMING.leadInMs;
  if (title && lines.length > 0) {
    events.push({ type: "title", start: TIMING.leadInMs, duration: TIMING.titleFadeMs });
    cursor += TIMING.titleLeadMs;
  }
  let lastWordEnd: number = cursor;

  lines.forEach((line, i) => {
    line.words.forEach((word, w) => {
      const isEmphasis = emphasised.has(word.id);
      const duration = Math.max(1, ms(spokenBeats(word)) + (isEmphasis ? ms(TIMING.emphasisHoldBeats) : 0));
      const isLineEnd = w === line.words.length - 1;

      const appear: AppearEvent = {
        type: "appear",
        wordId: word.id,
        start: cursor,
        duration,
        entrance: mood.entrance,
        isEmphasis,
        rhymeGroup: isLineEnd && line.rhymeLetter !== "X" ? line.rhymeLetter : null,
      };
      events.push(appear);
      startOf.set(word.id, cursor);
      if (isLineEnd) endWordOfLine.set(line.index, word.id);

      cursor += duration;
      lastWordEnd = cursor;
      const punct = punctuationPause(word.trailing);
      if (punct) cursor += ms(TIMING.pauseBeats[punct]);
    });

    // Structure between this line and the next.
    const next = lines[i + 1];
    if (!next) return;
    const stanzaBreak = next.stanzaIndex !== line.stanzaIndex;
    const pageChange = (pageOfLine[next.index] ?? 0) !== (pageOfLine[line.index] ?? 0);

    if (stanzaBreak) {
      const dim: StanzaDimEvent = {
        type: "stanza-dim",
        stanzaIndex: line.stanzaIndex,
        start: cursor,
        duration: TIMING.stanzaDimMs,
        toOpacity: TIMING.stanzaDimTo,
      };
      events.push(dim);
    }
    if (pageChange) {
      const page: PageEvent = {
        type: "page",
        pageIndex: pageOfLine[next.index] ?? 0,
        start: cursor,
        duration: TIMING.pageTransitionMs,
      };
      events.push(page);
      cursor += TIMING.pageTransitionMs;
    }
    cursor += ms(stanzaBreak ? TIMING.pauseBeats.stanza : TIMING.pauseBeats.line);
  });

  // When the later rhyme partner lands, the earlier one pulses.
  for (const pair of echoes ? prosody.rhymePairs : []) {
    const earlier = endWordOfLine.get(pair.a);
    const later = endWordOfLine.get(pair.b);
    const start = later ? startOf.get(later) : undefined;
    if (!earlier || !later || start === undefined) continue;
    const echo: EchoEvent = {
      type: "echo",
      wordId: earlier,
      triggerWordId: later,
      start,
      duration: TIMING.echoMs,
      strength: pair.strength,
    };
    events.push(echo);
  }

  if (lines.length > 0) {
    const footer: FooterEvent = { type: "footer", start: lastWordEnd + TIMING.footerDelayMs, duration: TIMING.footerFadeMs };
    events.push(footer);
  }

  events.sort((a, b) => a.start - b.start); // stable: ties keep creation order (appear before echo)

  // The footer fades in during the final hold, so it does not count towards when the poem itself is done.
  const lastEventEnd = events.reduce((max, e) => (e.type === "footer" ? max : Math.max(max, e.start + e.duration)), 0);
  const totalMs = Math.max(lastWordEnd, lastEventEnd) + TIMING.finalHoldMs + Math.max(0, Math.round(extraHoldMs));
  return { events, totalMs };
}
