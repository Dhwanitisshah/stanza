// Shared types for layout, timeline and the scene. Type-only imports from server modules are erased
// at compile time, so this file stays safe to import from client code.
import type { Analysis } from "@/lib/ai/schema";
import type { EntranceStyle, MoodPreset } from "@/lib/moods/types";
import type { PublicProsody } from "@/lib/prosody";
import type { LengthSolution } from "@/lib/timeline/speedForDuration";

export type FormatId = "reel" | "post";

/** Where the user's title goes: above the poem, in the footer, or nowhere. */
export type TitlePlacement = "above" | "footer" | "hidden";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Returns the width in px of `text` drawn with a CSS font string like `500 64px "Cormorant Garamond", serif`. */
export type MeasureText = (text: string, font: string) => number;

// ---------- layout ----------

/** One drawn run of text. A word is normally one piece; an unbreakably long word may span several rows. */
export interface Piece {
  text: string;
  x: number; // left edge
  y: number; // top of the row box
  width: number;
}

export interface PlacedWord {
  wordId: string;
  /** Measured and drawn in the mood's emphasis font (bolder and larger). */
  emphasized: boolean;
  stanzaIndex: number;
  lineIndex: number;
  page: number;
  pieces: Piece[];
  /** Bounding box of all pieces (row-box height). Always inside the safe area. */
  box: Rect;
}

/** One line of the footer (title or byline), already positioned. */
export interface FooterLine {
  text: string;
  x: number; // left edge
  y: number; // baseline
  font: string;
}

export interface LayoutPage {
  index: number;
  words: PlacedWord[];
}

export interface Layout {
  format: FormatId;
  width: number;
  height: number;
  safeArea: Rect;
  fontSize: number;
  rowHeight: number;
  /** CSS font string for poem text at `fontSize`. */
  font: string;
  /** CSS font string for emphasised words (the mood's weight and scale applied). */
  emphasisFont: string;
  /** Distance from the top of a row box to its text baseline. */
  baseline: number;
  pages: LayoutPage[];
  /** Page index of each poem line, by global line index. */
  pageOfLine: number[];
  /** The title drawn above the poem on page 0 (only when the placement is "above"), already positioned. */
  title: FooterLine | null;
  /** Title and byline in the bottom strip of the safe area (reserved on every page). Empty if neither is set. */
  footer: FooterLine[];
}

// ---------- timeline ----------

export interface AppearEvent {
  type: "appear";
  wordId: string;
  start: number;
  /** Time this word owns before the next word may start (spoken beats + emphasis hold). */
  duration: number;
  entrance: EntranceStyle;
  isEmphasis: boolean;
  /** Rhyme letter for line-end words that rhyme, otherwise null. */
  rhymeGroup: string | null;
}

/** When `triggerWordId` lands, the earlier rhyme partner `wordId` pulses. */
export interface EchoEvent {
  type: "echo";
  wordId: string;
  triggerWordId: string;
  start: number;
  duration: number;
  strength: "perfect" | "near" | "repeat";
}

/** The stanza that just ended dims to `toOpacity`. */
export interface StanzaDimEvent {
  type: "stanza-dim";
  stanzaIndex: number;
  start: number;
  duration: number;
  toOpacity: number;
}

/** The poster switches to page `pageIndex`. */
export interface PageEvent {
  type: "page";
  pageIndex: number;
  start: number;
  duration: number;
}

/** A title shown above the poem fades in before the first word. */
export interface TitleEvent {
  type: "title";
  start: number;
  duration: number;
}

/** The title and byline fade in during the final hold. */
export interface FooterEvent {
  type: "footer";
  start: number;
  duration: number;
}

export type TimelineEvent = AppearEvent | EchoEvent | StanzaDimEvent | PageEvent | TitleEvent | FooterEvent;

export interface Timeline {
  /** Sorted by start time. All values are integer milliseconds. */
  events: TimelineEvent[];
  totalMs: number;
}

// ---------- scene ----------

export interface Scene {
  prosody: PublicProsody;
  analysis: Analysis;
  /** The title the user set or accepted (analysis.title is only a suggestion). Undefined = no title on the poster. */
  title?: string;
  titlePlacement: TitlePlacement;
  /** Optional line under the title, e.g. "— Dhwanit". Shown in the footer of the final frame. */
  byline?: string;
  mood: MoodPreset;
  format: FormatId;
  speed: number;
  /** false when the rhyme echoes are switched off. */
  echoes: boolean;
  /** How the length was reached (speed, extra hold) and the shortest readable duration. */
  length: LengthSolution;
  layout: Layout;
  timeline: Timeline;
}
