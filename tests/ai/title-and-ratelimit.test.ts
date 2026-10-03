import { describe, expect, it } from "vitest";
import { createRateLimiter, clientIp } from "@/lib/ai/rateLimit";
import { isTitleFromPoem, suggestTitle } from "@/lib/ai/title";
import { analyzePoem, toPublicProsody } from "@/lib/prosody";
import { LAMP_ABAB, LETTERS_AABB, TRAFFIC_FREE_VERSE } from "../fixtures/poems";

const prosody = toPublicProsody(analyzePoem(LAMP_ABAB));

describe("isTitleFromPoem", () => {
  it("accepts words that are all in the poem, ignoring case and punctuation", () => {
    expect(isTitleFromPoem("Patient Moon", prosody)).toBe(true);
    expect(isTitleFromPoem("the kettle hums,", prosody)).toBe(true);
  });

  it("rejects a title with any word that is not in the poem", () => {
    expect(isTitleFromPoem("Midnight Moon", prosody)).toBe(false);
    expect(isTitleFromPoem("A Lament for the Floor", prosody)).toBe(false);
  });

  it("rejects empty and over-long titles", () => {
    expect(isTitleFromPoem("   ", prosody)).toBe(false);
    expect(isTitleFromPoem("the lamp burns low beside the door", prosody)).toBe(false); // 7 words
  });

});

describe("suggestTitle", () => {
  const suggest = (poem: string) => suggestTitle(toPublicProsody(analyzePoem(poem)));

  it("takes the closing phrase of the ABAB poem: from the last article", () => {
    expect(suggest(LAMP_ABAB)).toBe("A Patient Moon");
  });

  it("works on the AABB and free-verse fixtures", () => {
    expect(suggest(LETTERS_AABB)).toBe("The Cold"); // "but still the paper kept the cold."
    expect(suggest(TRAFFIC_FREE_VERSE)).toBe("The Signal Lights"); // "older than the signal lights."
  });

  it("uses the last 3 words when the line has no article or determiner", () => {
    expect(suggest("we walked home\nslowly through falling snow")).toBe("Through Falling Snow");
  });

  it("keeps at most 4 words, from the end of the phrase", () => {
    expect(suggest("and the long grey winter afternoon")).toBe("Long Grey Winter Afternoon");
  });

  it("strips punctuation and never ends on a function word", () => {
    expect(suggest("a light, a door, a window, the")).toBe("A Window");
    expect(suggest('"Look at the stars!"')).toBe("The Stars");
    expect(suggest("everything we were to")).toBeNull(); // we, were, to: all function words
  });

  it("keeps small words lowercase in the middle", () => {
    expect(suggest("the edge of the world")).toBe("The World");
    expect(suggest("a house of cards")).toBe("A House of Cards");
  });

  it("returns null for a last line made only of function words, and for empty poems", () => {
    expect(suggest("the lamp burns low\nand so it is")).toBeNull();
    expect(suggest("to be or not to be")).toBe("Not");
    expect(suggest("")).toBeNull();
    expect(suggest("...")).toBeNull();
  });

  it("only uses words from the poem", () => {
    const prosody = toPublicProsody(analyzePoem(LAMP_ABAB));
    expect(isTitleFromPoem(suggestTitle(prosody)!, prosody)).toBe(true);
  });

  it("capitalises hyphenated words and apostrophes sensibly", () => {
    expect(suggest("a well-known don't")).toBe("A Well-Known Don't");
  });
});

describe("rate limiter", () => {
  it("allows up to the limit, then blocks, then recovers as the window slides", () => {
    let now = 0;
    const limiter = createRateLimiter(3, 1000, () => now);
    expect([1, 2, 3, 4].map(() => limiter.allow("a"))).toEqual([true, true, true, false]);
    now = 999;
    expect(limiter.allow("a")).toBe(false);
    now = 1001;
    expect(limiter.allow("a")).toBe(true);
  });

  it("counts each key separately", () => {
    const limiter = createRateLimiter(1, 1000, () => 0);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("b")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for entry, then x-real-ip, then unknown", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
