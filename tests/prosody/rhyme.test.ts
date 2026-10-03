import { describe, expect, it } from "vitest";
import { compareWords, detectScheme, rhymeTail, spellingRhymeKey, type RhymeWord } from "@/lib/prosody/rhyme";
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

  it("lets a heuristic word repeat itself", () => {
    expect(compareWords(word("blorptastic"), word("blorptastic"))).toBe("repeat");
  });

  it("rhymes unknown words by spelling, as a near rhyme at most", () => {
    const invented = compareWords(word("blorptastic"), word("zimbastic"));
    expect(invented).toBe("near");
    expect(pronounce("blorptastic").source).toBe("heuristic");
    expect(pronounce("zimbastic").source).toBe("heuristic");
  });

  it("rhymes a Hindi-ish pair by spelling (pyaar / yaar)", () => {
    expect(pronounce("pyaar").source).toBe("heuristic");
    expect(pronounce("yaar").source).toBe("heuristic");
    expect(compareWords(word("pyaar"), word("yaar"))).toBe("near");
  });

  it("compares an unknown word with a dictionary word by spelling too", () => {
    expect(compareWords(word("bloon"), word("moon"))).toBe("near");
  });

  it("never calls a spelling rhyme perfect, and rejects different endings", () => {
    for (const [a, b] of [["pyaar", "yaar"], ["bloon", "moon"], ["blorptastic", "zimbastic"]]) {
      expect(compareWords(word(a), word(b))).not.toBe("perfect");
    }
    expect(compareWords(word("pyaar"), word("zimbastic"))).toBeNull();
    expect(compareWords(word("bloon"), word("floor"))).toBeNull();
  });

  it("still lets a dictionary pair win on sound, not spelling", () => {
    // "tune" and "moon" share a sound but not a spelling: the dictionary finds it.
    expect(compareWords(word("tune"), word("moon"))).toBe("perfect");
    // "though" and "through" share a spelling ending but not a sound.
    expect(compareWords(word("though"), word("through"))).toBeNull();
  });
});

describe("spellingRhymeKey", () => {
  it("takes the last vowel group to the end", () => {
    expect(spellingRhymeKey("pyaar")).toBe("aar");
    expect(spellingRhymeKey("yaar")).toBe("aar");
    expect(spellingRhymeKey("fantastic")).toBe("ic");
    expect(spellingRhymeKey("moon")).toBe("oon");
  });

  it("looks past a silent e", () => {
    expect(spellingRhymeKey("tune")).toBe("une");
    expect(spellingRhymeKey("kame")).toBe("ame");
    expect(spellingRhymeKey("tree")).toBe("ee");
  });

  it("treats y as a vowel only when there is no other vowel", () => {
    expect(spellingRhymeKey("myth")).toBe("yth"); // no other vowel, so y counts
    expect(spellingRhymeKey("sky")).toBeNull(); // the key would be a single letter
    expect(spellingRhymeKey("happy")).toBe("appy"); // other vowels exist, so the final y is just a consonant
  });

  it("returns null when there is nothing usable", () => {
    expect(spellingRhymeKey("")).toBeNull();
    expect(spellingRhymeKey("a")).toBeNull();
    expect(spellingRhymeKey("1984")).toBeNull();
    expect(spellingRhymeKey("\u{1F339}\u{1F339}")).toBeNull();
    expect(spellingRhymeKey("mmm")).toBeNull();
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
