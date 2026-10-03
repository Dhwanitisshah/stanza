// PURE: assembles everything renderFrame needs. Layout comes first because page changes become timeline events.
import type { Analysis } from "@/lib/ai/schema";
import type { MoodId } from "@/lib/moods/ids";
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
  format: FormatId;
  speed: number;
  measureText: MeasureText;
}

export function buildScene({ prosody, analysis, mood, format, speed, measureText }: SceneInput): Scene {
  const preset = getMoodPreset(mood ?? analysis.mood);
  const poemLayout = layout(prosody, format, preset, measureText);
  const timeline = buildTimeline(prosody, analysis, preset, speed, poemLayout.pageOfLine);
  return { prosody, analysis, mood: preset, format, speed, layout: poemLayout, timeline };
}
