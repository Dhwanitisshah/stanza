// Everything renderFrame needs to look up quickly, built ONCE per scene so the per-frame loop does no searching,
// no measuring and no string building. It is plain data derived from the scene: building it twice gives
// identical results.
import type { EchoStyle, EntranceStyle } from "@/lib/moods/types";
import { cubicBezier } from "./easing";
import { ENTRANCE_MS } from "./entrances";
import type { FooterLine, Piece, Scene } from "./types";

export interface WordSpan {
  pieces: Piece[];
  /** Characters (code points) per piece. */
  charCounts: number[];
  /** Typewriter only: prefixes[piece][n] is the first n characters of that piece. Precomputed, so the frame loop
   * neither measures nor builds strings. null for every other entrance. */
  prefixes: string[][] | null;
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
  /** The later rhyme partner that triggered each echo (the underline echo links the two). */
  echoPartners: WordSpan[];
}

export interface FrameIndex {
  totalMs: number;
  width: number;
  height: number;
  fontSize: number;
  baseline: number;
  font: string;
  emphasisFont: string;
  emphasisScale: number;
  background: string;
  ink: string;
  emphasisFill: string;
  underline: boolean;
  highlight: boolean;
  highlightFill: string;
  echoStyle: EchoStyle;
  echoFill: string;
  entranceMs: number;
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
  footer: FooterLine[];
  footerStart: number;
  footerDuration: number;
  ease: (x: number) => number;
}

/** How long dimmed stanzas take to come back to full strength once the poem is complete. */
export const RESTORE_MS = 800;

/** The footer is quiet: it never reaches full ink strength. */
export const FOOTER_ALPHA = 0.62;

const echoWeight = (strength: "perfect" | "near" | "repeat") => (strength === "near" ? 0.5 : 1);

export function buildFrameIndex(scene: Scene): FrameIndex {
  const { mood, layout, timeline, analysis } = scene;
  const palette = mood.palettes[Math.min(2, Math.max(0, Math.trunc(analysis.paletteVariant) || 0))];
  const typewriter = mood.entrance === "typewriter";

  const spans = new Map<string, WordSpan>();
  const words: WordSpan[] = [];
  for (const page of layout.pages) {
    for (const word of page.words) {
      const chars = word.pieces.map((piece) => Array.from(piece.text));
      const span: WordSpan = {
        pieces: word.pieces,
        charCounts: chars.map((c) => c.length),
        prefixes: typewriter ? chars.map((c) => c.map((_, n) => c.slice(0, n).join("")).concat(c.join(""))) : null,
        page: page.index,
        stanza: word.stanzaIndex,
        entrance: mood.entrance,
        appearStart: Infinity,
        emphasized: word.emphasized,
        echoStarts: [],
        echoDurations: [],
        echoWeights: [],
        echoPartners: [],
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
  let footerStart = Infinity;
  let footerDuration = 1;

  for (const event of timeline.events) {
    switch (event.type) {
      case "appear": {
        const span = spans.get(event.wordId);
        if (span) span.appearStart = event.start;
        restoreStart = Math.max(restoreStart, event.start + event.duration);
        break;
      }
      case "echo": {
        const span = spans.get(event.wordId);
        const partner = spans.get(event.triggerWordId);
        if (span && partner) {
          span.echoStarts.push(event.start);
          span.echoDurations.push(event.duration);
          span.echoWeights.push(echoWeight(event.strength));
          span.echoPartners.push(partner);
        }
        break;
      }
      case "stanza-dim":
        dimStart[event.stanzaIndex] = event.start;
        dimDuration[event.stanzaIndex] = event.duration;
        dimTo[event.stanzaIndex] = event.toOpacity;
        break;
      case "page":
        pageStart[event.pageIndex] = event.start;
        pageDuration[event.pageIndex] = event.duration;
        break;
      case "footer":
        footerStart = event.start;
        footerDuration = Math.max(1, event.duration);
        break;
    }
  }

  return {
    totalMs: timeline.totalMs,
    width: layout.width,
    height: layout.height,
    fontSize: layout.fontSize,
    baseline: layout.baseline,
    font: layout.font,
    emphasisFont: layout.emphasisFont,
    emphasisScale: mood.emphasis.scale,
    background: palette.background,
    ink: palette.ink,
    emphasisFill: palette[mood.emphasis.color] ?? palette.accent,
    underline: mood.emphasis.underline,
    highlight: mood.emphasis.highlight,
    highlightFill: palette.accent,
    echoStyle: mood.echo.style,
    echoFill: palette[mood.echo.color] ?? palette.accent,
    entranceMs: ENTRANCE_MS[mood.entrance],
    textureIntensity: mood.textureIntensity,
    words,
    pageStart,
    pageDuration,
    pageCount: layout.pages.length,
    dimStart,
    dimDuration,
    dimTo,
    restoreStart,
    footer: layout.footer,
    footerStart,
    footerDuration,
    ease: cubicBezier(mood.easing),
  };
}
