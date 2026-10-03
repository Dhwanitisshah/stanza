import { describe, expect, it } from "vitest";
import { createRateLimiter, clientIp } from "@/lib/ai/rateLimit";
import { firstLineFragment, isTitleFromPoem } from "@/lib/ai/title";
import { analyzePoem, toPublicProsody } from "@/lib/prosody";
import { LAMP_ABAB } from "../fixtures/poems";

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

  it("builds a fragment from the first line", () => {
    expect(firstLineFragment(prosody)).toBe("The lamp burns low beside the");
    expect(firstLineFragment(toPublicProsody(analyzePoem("")))).toBe("");
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
