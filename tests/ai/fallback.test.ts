import { describe, expect, it } from "vitest";
import { fallbackAnalysis } from "@/lib/ai/fallback";
import { AnalysisSchema } from "@/lib/ai/schema";
import { isTitleFromPoem } from "@/lib/ai/title";
import { MOOD_IDS } from "@/lib/moods/ids";
import { analyzePoem, toPublicProsody } from "@/lib/prosody";
import { ABAB, EDGE_CASES, LAMP_ABAB, TRAFFIC_FREE_VERSE } from "../fixtures/poems";

const prosodyOf = (poem: string) => toPublicProsody(analyzePoem(poem));

describe("fallbackAnalysis", () => {
  it("is deterministic: same poem, same output", () => {
    const first = fallbackAnalysis(prosodyOf(LAMP_ABAB));
    const second = fallbackAnalysis(prosodyOf(LAMP_ABAB));
    expect(second).toEqual(first);
  });

  it("always produces a valid analysis, even for edge-case input", () => {
    for (const [name, text] of Object.entries(EDGE_CASES)) {
      const result = fallbackAnalysis(prosodyOf(text));
      expect(AnalysisSchema.safeParse(result).success, name).toBe(true);
    }
  });

  it("picks the mood with the most keyword hits", () => {
    expect(fallbackAnalysis(prosodyOf("The rain is cold,\nI am alone and lost")).mood).toBe("Melancholy");
    expect(fallbackAnalysis(prosodyOf("We laugh and dance in the sun,\nsinging a golden song")).mood).toBe("Joyful");
    expect(fallbackAnalysis(prosodyOf("Never break, never bow,\nrise and stand and fight")).mood).toBe("Defiant");
  });

  it("defaults to Tender when no keyword matches", () => {
    const analysis = fallbackAnalysis(prosodyOf("Pimpri chai wallah"));
    expect(analysis.mood).toBe("Tender");
    expect(analysis.intensity).toBe(0.4);
  });

  it("keeps mood, intensity and palette variant in range", () => {
    for (const poem of [LAMP_ABAB, ABAB, TRAFFIC_FREE_VERSE]) {
      const a = fallbackAnalysis(prosodyOf(poem));
      expect(MOOD_IDS).toContain(a.mood);
      expect(a.intensity).toBeGreaterThanOrEqual(0);
      expect(a.intensity).toBeLessThanOrEqual(1);
      expect([0, 1, 2]).toContain(a.paletteVariant);
    }
  });

  it("emphasises the longest stressed content word of each line, never a function word", () => {
    const prosody = prosodyOf(LAMP_ABAB);
    const analysis = fallbackAnalysis(prosody);
    const words = prosody.stanzas.flatMap((s) => s.lines.flatMap((l) => l.words));
    const emphasised = analysis.emphasis.map((id) => words.find((w) => w.id === id)?.core);

    expect(emphasised).toEqual(["beside", "kettle", "wooden", "somewhere"]);
    expect(analysis.emphasis).toHaveLength(prosody.scheme.length); // one per line
  });

  it("builds the title from the poem's own first words", () => {
    const prosody = prosodyOf(LAMP_ABAB);
    const { title } = fallbackAnalysis(prosody);
    expect(title).toBe("The lamp burns low beside the");
    expect(isTitleFromPoem(title, prosody)).toBe(true);
  });

  it("gives a mood-appropriate reading sentence", () => {
    const reading = fallbackAnalysis(prosodyOf("The rain is cold,\nI am alone")).reading;
    expect(reading).toMatch(/wistful/i);
  });
});
