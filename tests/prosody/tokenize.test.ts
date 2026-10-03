import { describe, expect, it } from "vitest";
import { tokenize } from "@/lib/prosody/tokenize";
import { ABAB } from "../fixtures/poems";

const coreWords = (poem: string) => tokenize(poem).stanzas.flatMap((s) => s.lines.flatMap((l) => l.words.map((w) => w.core)));

describe("tokenize", () => {
  it("splits stanzas on blank lines and numbers lines across the poem", () => {
    const poem = tokenize("one two\nthree\n\n\nfour");
    expect(poem.stanzas).toHaveLength(2);
    expect(poem.stanzas[0].lines.map((l) => l.index)).toEqual([0, 1]);
    expect(poem.stanzas[1].lines[0].index).toBe(2);
    expect(poem.stanzas[1].lines[0].stanzaIndex).toBe(1);
  });

  it("keeps punctuation attached to words but out of the core", () => {
    const [word] = tokenize("“Hello,”").stanzas[0].lines[0].words;
    expect(word.core).toBe("Hello");
    expect(word.leading).toBe('"');
    expect(word.trailing).toBe(',"');
    expect(word.text).toBe('"Hello,"');
  });

  it("keeps apostrophes and hyphens inside one word", () => {
    expect(coreWords("don’t stop the well-known o'er")).toEqual(["don't", "stop", "the", "well-known", "o'er"]);
  });

  it("splits on em dashes and keeps the dash with the word before it", () => {
    const words = tokenize("wait—what -- no").stanzas[0].lines[0].words;
    expect(words.map((w) => w.core)).toEqual(["wait", "what", "no"]);
    expect(words[0].trailing).toBe("—");
    expect(words[1].trailing).toBe("--");
  });

  it("glues a stray punctuation chunk onto the previous word, or the next one at line start", () => {
    const [mid] = tokenize("hello ... world").stanzas[0].lines;
    expect(mid.words[0].trailing).toBe("...");
    const [start] = tokenize("— hello").stanzas[0].lines;
    expect(start.words[0].leading).toBe("—");
  });

  it("gives every word a unique stable id and a position", () => {
    const words = tokenize(ABAB).stanzas.flatMap((s) => s.lines.flatMap((l) => l.words));
    expect(new Set(words.map((w) => w.id)).size).toBe(words.length);
    expect(words[0]).toMatchObject({ id: "w0", index: 0, wordIndex: 0, lineIndex: 0 });
  });

  it("drops lines with no words and handles CRLF", () => {
    expect(tokenize("...\n!!!").stanzas).toHaveLength(0);
    expect(tokenize("a\r\nb\r\n\r\nc").stanzas.map((s) => s.lines.length)).toEqual([2, 1]);
  });

  it("returns no stanzas for empty or whitespace input", () => {
    expect(tokenize("").stanzas).toEqual([]);
    expect(tokenize("  \n \n").stanzas).toEqual([]);
  });
});
