// PURE: assembles everything renderFrame needs. Layout comes first because page changes become timeline events.
import type { Analysis } from "@/lib/ai/schema";
import type { MoodId } from "@/lib/moods/ids";
import type { MoodPreset } from "@/lib/moods/types";
import { getMoodPreset } from "@/lib/moods/presets";
import type { PublicProsody } from "@/lib/prosody";
import { buildTimeline } from "@/lib/timeline/buildTimeline";
import { layout } from "./layout";
import type { FormatId, MeasureText, Scene } from "./types";

export interface SceneInput {
  prosody: PublicProsody;
  analysis: Analysis;
  /** Overrides analysis.mood when the user swaps the mood. */
  mood?: MoodId;
  /** A ready-made preset (e.g. with font variables resolved in the browser). Wins over `mood`. */
  preset?: MoodPreset;
  format: FormatId;
  speed: number;
  /** Optional byline for the footer, e.g. "— Dhwanit". */
  byline?: string;
  measureText: MeasureText;
}

export function buildScene({ prosody, analysis, mood, preset: given, format, speed, byline, measureText }: SceneInput): Scene {
  const preset = given ?? getMoodPreset(mood ?? analysis.mood);
  const poemLayout = layout(prosody, format, preset, measureText, new Set(analysis.emphasis), { title: analysis.title, byline });
  const timeline = buildTimeline(prosody, analysis, preset, speed, poemLayout.pageOfLine);
  return { prosody, analysis, byline, mood: preset, format, speed, layout: poemLayout, timeline };
}
