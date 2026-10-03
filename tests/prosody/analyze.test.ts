import { describe, expect, it } from "vitest";
import { analyzePoem } from "@/lib/prosody";
import { AABB, ABAB, EDGE_CASES, FREE_VERSE, LAMP_ABAB, LETTERS_AABB, TRAFFIC_FREE_VERSE } from "../fixtures/poems";

describe("analyzePoem: sample poems", () => {
  it("detects ABABCC in Wordsworth", () => {
    const result = analyzePoem(ABAB);
    expect(result.scheme).toBe("ABABCC");
    expect(result.rhymePairs.every((p) => p.strength === "perfect")).toBe(true);
    expect(result.stanzas).toHaveLength(1);
    expect(result.stanzas[0].lines[0].words[0].core).toBe("I");
  });

  it("detects AABB in Blake", () => {
    const result = analyzePoem(AABB);
    expect(result.scheme).toBe("AABB");
    expect(result.rhymeGroups.map((g) => g.lines)).toEqual([[0, 1], [2, 3]]);
  });

  it("finds no end rhymes in Whitman's free verse", () => {
    const result = analyzePoem(FREE_VERSE);
    expect(result.scheme).toBe("XXXX");
    expect(result.rhymePairs).toEqual([]);
  });

  it("reports near rhymes (time/mine) and repeats (day/day)", () => {
    expect(analyzePoem("I watched the passing time\nAnd wished that you were mine").rhymePairs).toEqual([
      { a: 0, b: 1, strength: "near" },
    ]);
    const repeat = analyzePoem("Take me away to a brand new day\nAnd let me be as I was that day");
    expect(repeat.scheme).toBe("AA");
    expect(repeat.rhymePairs).toEqual([{ a: 0, b: 1, strength: "repeat" }]);
  });

  it("keeps letters running across stanzas and gives each stanza its own scheme", () => {
    const result = analyzePoem("the sun\nin the sky\n\nanother one\nso high");
    expect(result.scheme).toBe("ABAB");
    expect(result.stanzas.map((s) => s.scheme)).toEqual(["AB", "AB"]);
  });
});

describe("analyzePoem: word details", () => {
  const words = analyzePoem("The daffodils, o'er blorptastic hills").stanzas[0].lines[0].words;

  it("demotes function words to unstressed", () => {
    expect(words[0]).toMatchObject({ core: "The", stress: "0", syllables: 1 });
  });

  it("keeps CMU stress for content words and sums syllables per line", () => {
    expect(words[1]).toMatchObject({ core: "daffodils", stress: "102", syllables: 3, source: "cmu" });
    expect(analyzePoem("The daffodils, o'er blorptastic hills").stanzas[0].lines[0].syllables).toBe(
      words.reduce((n, w) => n + w.syllables, 0),
    );
  });

  it("flags heuristic words and gives them first-syllable stress", () => {
    const unknown = words[3];
    expect(unknown.source).toBe("heuristic");
    expect(unknown.stress[0]).toBe("1");
    expect(unknown.stress).toHaveLength(unknown.syllables);
  });

  it("keeps trailing punctuation for the timeline", () => {
    expect(words[1].trailing).toBe(",");
  });

  it("stress string length always equals syllable count", () => {
    for (const poem of [ABAB, AABB, FREE_VERSE]) {
      for (const stanza of analyzePoem(poem).stanzas)
        for (const line of stanza.lines) for (const w of line.words) expect(w.stress).toHaveLength(w.syllables);
    }
  });
});

describe("analyzePoem: edge cases never throw", () => {
  it.each(Object.entries(EDGE_CASES))("%s", (_name, text) => {
    const result = analyzePoem(text);
    expect(result.scheme).toHaveLength(result.stanzas.reduce((n, s) => n + s.lines.length, 0));
    expect(result.wordCount).toBeGreaterThanOrEqual(0);
  });

  it("returns an empty result for empty input", () => {
    expect(analyzePoem("")).toMatchObject({ stanzas: [], scheme: "", wordCount: 0, syllableCount: 0 });
  });

  it("tolerates non-string input at runtime", () => {
    expect(() => analyzePoem(undefined as unknown as string)).not.toThrow();
  });
});

describe("analyzePoem: TESTING.md poems", () => {
  it("detects ABAB, AABB and no scheme in the originals", () => {
    expect(analyzePoem(LAMP_ABAB).scheme).toBe("ABAB");
    expect(analyzePoem(LETTERS_AABB).scheme).toBe("AABB");
    expect(analyzePoem(TRAFFIC_FREE_VERSE).scheme).toBe("XXXX");
  });

  it("ignores punctuation when matching rhymes (door, / floor,)", () => {
    expect(analyzePoem(LAMP_ABAB).rhymeGroups[0].lines).toEqual([0, 2]);
  });

  it("splits the ABAB poem into 2 stanzas at a blank line", () => {
    const lines = LAMP_ABAB.trimEnd().split("\n");
    const result = analyzePoem([...lines.slice(0, 2), "", ...lines.slice(2)].join("\n"));
    expect(result.stanzas).toHaveLength(2);
    expect(result.scheme).toBe("ABAB");
  });

  it("counts syllables sensibly", () => {
    const count = (w: string) => analyzePoem(w).syllableCount;
    expect(count("beautiful")).toBe(3);
    expect(count("moon")).toBe(1);
    expect(count("quiet")).toBe(2);
    expect([1, 2]).toContain(count("fire"));
  });

  it("treats auxiliary and modal verbs as unstressed (has, had, will, could...)", () => {
    const words = analyzePoem(LAMP_ABAB).stanzas[0].lines[2].words;
    expect(words.find((w) => w.core === "has")).toMatchObject({ stress: "0" });
    for (const aux of ["am", "are", "was", "were", "be", "been", "has", "had", "have", "do", "does", "did", "will", "would", "shall", "should", "can", "could", "may", "might", "must"]) {
      expect(analyzePoem(aux).stanzas[0].lines[0].words[0].stress, aux).toBe("0");
    }
  });

  it("gives unknown words like wallah a heuristic count instead of crashing", () => {
    const words = analyzePoem(EDGE_CASES.unknownWords).stanzas[0].lines[0].words;
    expect(words.find((w) => w.core === "wallah")).toMatchObject({ source: "heuristic" });
    expect(words.every((w) => w.syllables >= 1)).toBe(true);
  });
});
