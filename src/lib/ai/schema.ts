import "server-only";
import { z } from "zod";
import { MOOD_IDS, type MoodId } from "@/lib/moods/ids";

/** What we ask Gemini for, and what the rest of the app receives. */
export const AnalysisSchema = z.object({
  mood: z.enum(MOOD_IDS),
  intensity: z.number().min(0).max(1),
  /** Word ids from the prosody result (e.g. "w12"), at most 2 per line. */
  emphasis: z.array(z.string()),
  /** A SUGGESTED title built only from words in the poem, or null if none fits. Never shown unless the user accepts it. */
  title: z.string().nullable(),
  /** Which of the mood's palette variants to use. */
  paletteVariant: z.number().int().min(0).max(2),
  /** One sentence describing the poem's feeling. */
  reading: z.string(),
});

export type Analysis = z.infer<typeof AnalysisSchema>;
export type AnalysisSource = "gemini" | "fallback" | "skipped";
export type { MoodId };
