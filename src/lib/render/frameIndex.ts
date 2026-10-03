// Everything renderFrame needs to look up quickly, built ONCE per scene so the per-frame loop does no searching
// and no allocation. It is plain data derived from the scene: building it twice gives identical results.
import type { EntranceStyle } from "@/lib/moods/types";
import { cubicBezier } from "./easing";
import type { Piece, Scene } from "./types";

export interface WordSpan {
  pieces: Piece[];
  page: number;
  stanza: number;
  entrance: EntranceStyle;
  appearStart: number;
  emphasized: boolean;
  /** Echo pulses that hit this word: parallel arrays, no objects. */
  echoStarts: number[];
  echoDurations: number[];
  /** 1 for perfect and repeat rhymes, softer for near rhymes. */
  echoWeights: number[];
}

export interface FrameIndex {
  totalMs: number;
  width: number;
  height: number;
  fontSize: number;
  baseline: number;
  font: string;
  emphasisFont: string;
  background: string;
  ink: string;
  emphasisFill: string;
  echoFill: string;
  underline: boolean;
  textureIntensity: number;
  /** Words in drawing order (page by page, top to bottom). */
  words: WordSpan[];
  /** Page event timing, by page index. Page 0 has none (it is there from the start). */
  pageStart: number[];
  pageDuration: number[];
  pageCount: number;
  /** Stanza dim timing by stanza index; undefined = this stanza never dims (it is the last one). */
  dimStart: number[];
  dimDuration: number[];
  dimTo: number[];
  /** When the last word has finished: dims then fade back so the final frame is the full poster. */
  restoreStart: number;
  ease: (x: number) => number;
}

/** How long dimmed stanzas take to come back to full strength once the poem is complete. */
export const RESTORE_MS = 800;

const echoWeight = (strength: "perfect" | "near" | "repeat") => (strength === "near" ? 0.5 : 1);

export function buildFrameIndex(scene: Scene): FrameIndex {
  const { mood, layout, timeline, analysis } = scene;
  const palette = mood.palettes[Math.min(2, Math.max(0, Math.trunc(analysis.paletteVariant) || 0))];

  const spans = new Map<string, WordSpan>();
  const words: WordSpan[] = [];
  for (const page of layout.pages) {
    for (const word of page.words) {
      const span: WordSpan = {
        pieces: word.pieces,
        page: page.index,
        stanza: word.stanzaIndex,
        entrance: mood.entrance,
        appearStart: Infinity,
        emphasized: word.emphasized,
        echoStarts: [],
        echoDurations: [],
        echoWeights: [],
      };
      spans.set(word.wordId, span);
      words.push(span);
    }
  }

  const pageStart: number[] = [];
  const pageDuration: number[] = [];
  const dimStart: number[] = [];
  const dimDuration: number[] = [];
  const dimTo: number[] = [];
  let restoreStart = 0;

  for (const event of timeline.events) {
    if (event.type === "appear") {
      const span = spans.get(event.wordId);
      if (span) span.appearStart = event.start;
      restoreStart = Math.max(restoreStart, event.start + event.duration);
    } else if (event.type === "echo") {
      const span = spans.get(event.wordId);
      if (span) {
        span.echoStarts.push(event.start);
        span.echoDurations.push(event.duration);
        span.echoWeights.push(echoWeight(event.strength));
      }
    } else if (event.type === "stanza-dim") {
      dimStart[event.stanzaIndex] = event.start;
      dimDuration[event.stanzaIndex] = event.duration;
      dimTo[event.stanzaIndex] = event.toOpacity;
    } else {
      pageStart[event.pageIndex] = event.start;
      pageDuration[event.pageIndex] = event.duration;
    }
  }

  const emphasisFill = palette[mood.emphasis.color] ?? palette.accent;
  return {
    totalMs: timeline.totalMs,
    width: layout.width,
    height: layout.height,
    fontSize: layout.fontSize,
    baseline: layout.baseline,
    font: layout.font,
    emphasisFont: layout.emphasisFont,
    background: palette.background,
    ink: palette.ink,
    emphasisFill,
    // An echo on an already-accented word needs a different colour to be visible.
    echoFill: emphasisFill === palette.accent ? (palette.accent2 ?? palette.accent) : palette.accent,
    underline: mood.emphasis.underline,
    textureIntensity: mood.textureIntensity,
    words,
    pageStart,
    pageDuration,
    pageCount: layout.pages.length,
    dimStart,
    dimDuration,
    dimTo,
    restoreStart,
    ease: cubicBezier(mood.easing),
  };
}
