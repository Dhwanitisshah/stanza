import { describe, expect, it } from "vitest";
import { demoteFunctionWord, heuristicStress, isFunctionWord, stressFromPhonemes } from "@/lib/prosody/stress";
import { pronounce } from "@/lib/prosody/syllables";

describe("pronounce", () => {
  it("reads syllables from CMU vowels", () => {
    expect(pronounce("door")).toMatchObject({ syllables: 1, source: "cmu" });
    expect(pronounce("daffodils")).toMatchObject({ syllables: 3, source: "cmu" });
  });

  it("is case-insensitive", () => {
    expect(pronounce("Hello").syllables).toBe(pronounce("hello").syllables);
  });

  it("collects every pronunciation variant, first one first", () => {
    const read = pronounce("read");
    expect(read.variants.length).toBeGreaterThanOrEqual(2);
    expect(read.variants[0]).toEqual(["R", "EH1", "D"]);
    expect(read.variants.map((v) => v.join(" "))).toContain("R IY1 D");
  });

  it("falls back to the heuristic for unknown words and flags them", () => {
    const result = pronounce("blorptastic");
    expect(result.source).toBe("heuristic");
    expect(result.variants).toEqual([]);
    expect(result.syllables).toBeGreaterThanOrEqual(2);
  });

  it("handles apostrophes: contractions, elisions, edge apostrophes, possessives", () => {
    expect(pronounce("don't")).toMatchObject({ syllables: 1, source: "cmu" });
    expect(pronounce("o'er")).toMatchObject({ syllables: 2, source: "cmu" }); // elision -> "over"
    expect(pronounce("tis", "'")).toMatchObject({ source: "cmu" }); // 'tis
    expect(pronounce("moon's").source).toBe("cmu");
  });

  it("handles hyphenated words as one word", () => {
    expect(pronounce("well-known")).toMatchObject({ syllables: 2, source: "cmu" });
    const joined = pronounce("sun-drenched");
    expect(joined.syllables).toBeGreaterThanOrEqual(2);
  });

  it("never reports zero syllables and ignores Object.prototype keys", () => {
    for (const w of ["hmm", "1984", "constructor", "__proto__", "a".repeat(500)]) {
      expect(pronounce(w).syllables).toBeGreaterThanOrEqual(1);
    }
    expect(pronounce("constructor").source).toBe("cmu");
  });
});

describe("stress", () => {
  it("reads one digit per syllable", () => {
    expect(stressFromPhonemes(["D", "AO1", "R"])).toBe("1");
    expect(stressFromPhonemes(pronounce("daffodils").variants[0])).toBe("102");
    expect(stressFromPhonemes(pronounce("wander").variants[0])).toBe("10");
  });

  it("puts heuristic stress on the first syllable", () => {
    expect(heuristicStress(1)).toBe("1");
    expect(heuristicStress(3)).toBe("100");
  });

  it("demotes one-syllable function words only", () => {
    expect(isFunctionWord("The")).toBe(true);
    expect(demoteFunctionWord("the", "1")).toBe("0");
    expect(demoteFunctionWord("moon", "1")).toBe("1");
    expect(demoteFunctionWord("into", "10")).toBe("10"); // multi-syllable: untouched
  });
});
