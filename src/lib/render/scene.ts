// PURE: assembles everything renderFrame needs. Layout comes first because page changes become timeline events,
// and the length solver needs to know about them (they are fixed time that speed cannot change).
import type { Analysis } from "@/lib/ai/schema";
import type { MoodId } from "@/lib/moods/ids";
import { getMoodPreset } from "@/lib/moods/presets";
import type { MoodPreset } from "@/lib/moods/types";
import type { PublicProsody } from "@/lib/prosody";
import { buildTimeline } from "@/lib/timeline/buildTimeline";
import { speedForDuration } from "@/lib/timeline/speedForDuration";
import { layout } from "./layout";
import type { FormatId, MeasureText, Scene, TitlePlacement } from "./types";

export interface SceneInput {
  prosody: PublicProsody;
  analysis: Analysis;
  /** Overrides analysis.mood when the user swaps the mood. */
  mood?: MoodId;
  /** A ready-made preset (e.g. with font variables resolved in the browser). Wins over `mood`. */
  preset?: MoodPreset;
  format: FormatId;
  /** Playback speed. Ignored when `lengthMs` is a number. Default 1. */
  speed?: number;
  /** Target duration in ms (the length control). null or undefined = Auto: use `speed`. */
  lengthMs?: number | null;
  /** The title the USER set or accepted. analysis.title is only a suggestion and is never drawn by itself. */
  title?: string;
  /** Where the title goes. Default "footer". */
  titlePlacement?: TitlePlacement;
  /** Optional byline for the footer, e.g. "— Dhwanit". */
  byline?: string;
  /** false drops the rhyme echoes. Default true. */
  echoes?: boolean;
  measureText: MeasureText;
}

export function buildScene({
  prosody,
  analysis,
  mood,
  preset: given,
  format,
  speed = 1,
  lengthMs = null,
  title,
  titlePlacement = "footer",
  byline,
  echoes = true,
  measureText,
}: SceneInput): Scene {
  const preset = given ?? getMoodPreset(mood ?? analysis.mood);
  const poemLayout = layout(prosody, format, preset, measureText, new Set(analysis.emphasis), { title, titlePlacement, byline });
  const titleAbove = poemLayout.title !== null;

  const solved = speedForDuration(prosody, analysis, preset, lengthMs, { pageOfLine: poemLayout.pageOfLine, echoes, title: titleAbove });
  const useSolution = lengthMs !== null && Number.isFinite(lengthMs);
  const finalSpeed = useSolution ? solved.speed : speed;
  const extraHoldMs = useSolution ? solved.extraHoldMs : 0;

  const timeline = buildTimeline(prosody, analysis, preset, finalSpeed, poemLayout.pageOfLine, { echoes, title: titleAbove, extraHoldMs });
  return {
    prosody,
    analysis,
    title,
    titlePlacement,
    byline,
    mood: preset,
    format,
    speed: finalSpeed,
    echoes,
    length: { ...solved, speed: finalSpeed, totalMs: timeline.totalMs },
    layout: poemLayout,
    timeline,
  };
}
