import { describe, expect, it } from "vitest";
import { compareWords, detectScheme, rhymeTail, type RhymeWord } from "@/lib/prosody/rhyme";
import { pronounce } from "@/lib/prosody/syllables";

const word = (core: string): RhymeWord => ({ core, variants: pronounce(core).variants });

describe("rhymeTail", () => {
  it("starts at the last stressed vowel", () => {
    expect(rhymeTail(["D", "AO1", "R"])).toEqual(["AO1", "R"]);
    expect(rhymeTail(pronounce("daffodils").variants[0])).toEqual(["IH2", "L", "Z"]);
  });

  it("falls back to the last vowel when nothing is stressed", () => {
    expect(rhymeTail(["DH", "AH0"])).toEqual(["AH0"]);
  });
});

describe("compareWords", () => {
  it("finds perfect rhymes", () => {
    expect(compareWords(word("door"), word("floor"))).toBe("perfect");
    expect(compareWords(word("tune"), word("moon"))).toBe("perfect");
    expect(compareWords(word("hills"), word("daffodils"))).toBe("perfect");
  });

  it("finds near rhymes: same vowel, final consonants in the same class", () => {
    expect(compareWords(word("time"), word("mine"))).toBe("near"); // M ~ N (nasals)
    expect(compareWords(word("lap"), word("cat"))).toBe("near"); // P ~ T (stops)
  });

  it("rejects different vowels and different consonant classes", () => {
    expect(compareWords(word("time"), word("moon"))).toBeNull();
    expect(compareWords(word("time"), word("tile"))).toBeNull(); // nasal vs liquid
    expect(compareWords(word("day"), word("daylight"))).toBeNull();
  });

  it("treats identical words as a repeat, not a rhyme", () => {
    expect(compareWords(word("day"), word("day"))).toBe("repeat");
    expect(compareWords(word("Day"), word("day"))).toBe("repeat");
  });

  it("tries all pronunciation variants", () => {
    // "read" can be R EH1 D or R IY1 D, so it rhymes with both "bed" and "need".
    expect(compareWords(word("read"), word("bed"))).toBe("perfect");
    expect(compareWords(word("read"), word("need"))).toBe("perfect");
  });

  it("only lets heuristic words repeat", () => {
    expect(compareWords(word("blorptastic"), word("fantastic"))).toBeNull();
    expect(compareWords(word("blorptastic"), word("blorptastic"))).toBe("repeat");
  });
});

describe("detectScheme", () => {
  const scheme = (...ends: (string | null)[]) => detectScheme(ends.map((e) => (e ? word(e) : null)));

  it("labels ABAB", () => {
    expect(scheme("cloud", "hills", "crowd", "daffodils").letters.join("")).toBe("ABAB");
  });

  it("labels AABB", () => {
    expect(scheme("friend", "end", "foe", "grow").letters.join("")).toBe("AABB");
  });

  it("marks unrhymed lines X and does not spend a letter on them", () => {
    expect(scheme("cloud", "sea", "crowd", "stone").letters.join("")).toBe("AXAX");
  });

  it("records pair strength", () => {
    const { pairs } = scheme("time", "mine", "day", "day");
    expect(pairs).toEqual([
      { a: 0, b: 1, strength: "near" },
      { a: 2, b: 3, strength: "repeat" },
    ]);
  });

  it("copes with lines that have no end word", () => {
    expect(scheme(null, "door", null, "floor").letters.join("")).toBe("XAXA");
    expect(scheme().letters).toEqual([]);
  });
});
