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

  describe("emphasis", () => {
    const emphasisOf = (poem: string) => {
      const prosody = prosodyOf(poem);
      const words = prosody.stanzas.flatMap((st) => st.lines.flatMap((l) => l.words));
      return fallbackAnalysis(prosody).emphasis.map((id) => words.find((w) => w.id === id)!.core);
    };

    it("picks at most one word per stanza", () => {
      expect(emphasisOf(LAMP_ABAB)).toHaveLength(1);
      expect(emphasisOf("the rain is cold\nI am alone\n\nthe sun is bright\nwe laugh and dance\n\nhello")).toHaveLength(3);
      expect(emphasisOf("")).toEqual([]);
    });

    it("picks the line-final content word, skipping function words at the end of the line", () => {
      expect(emphasisOf("we went down to the sea and it")).toEqual(["sea"]);
    });

    it("prefers the strongest line: more mood keywords, then a rhyme", () => {
      // "lonely cold gray" are Melancholy keywords, so line 2 wins over the longer final word on line 1.
      expect(emphasisOf("the extraordinarily wonderful afternoon\nthe lonely cold gray evening")).toEqual(["evening"]);
      // Equal keywords (none): the rhyming lines beat the unrhymed one.
      expect(emphasisOf("a big supercalifragilistic word\nthe moon\nthe tune")).toEqual(["moon"]);
    });

    it("uses the longest final content word only as a tie-break", () => {
      expect(emphasisOf("a little dog\na tremendous elephant")).toEqual(["elephant"]);
    });

    it("is stable: same poem, same words", () => {
      expect(emphasisOf(LAMP_ABAB)).toEqual(emphasisOf(LAMP_ABAB));
    });

    it("skips stanzas with no content words", () => {
      expect(emphasisOf("the a of")).toEqual([]);
    });
  });

  it("suggests the closing phrase of the last line as a title", () => {
    const prosody = prosodyOf(LAMP_ABAB);
    const { title } = fallbackAnalysis(prosody);
    expect(title).toBe("A Patient Moon");
    expect(isTitleFromPoem(title!, prosody)).toBe(true);
  });

  it("suggests null, not junk, when the last line has nothing to offer", () => {
    expect(fallbackAnalysis(prosodyOf("the lamp burns low\nand so it is")).title).toBeNull();
    expect(fallbackAnalysis(prosodyOf("")).title).toBeNull();
  });

  it("gives a mood-appropriate reading sentence", () => {
    const reading = fallbackAnalysis(prosodyOf("The rain is cold,\nI am alone")).reading;
    expect(reading).toMatch(/wistful/i);
  });
});
