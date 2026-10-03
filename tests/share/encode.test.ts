import { compressToEncodedURIComponent } from "lz-string";
import { describe, expect, it } from "vitest";
import { MOOD_IDS } from "@/lib/moods/ids";
import { decodeShare, encodeShare, LIMITS, readShareHash, SHARE_VERSION, shareHash, type ShareState } from "@/lib/share/encode";
import { SAMPLES } from "@/lib/samples";

const base: ShareState = {
  poem: "The lamp burns low beside the door,\nthe kettle hums a quiet tune,",
  title: "A Patient Moon",
  titlePlacement: "above",
  byline: "— Dhwanit Shah",
  mood: "Melancholy",
  paletteVariant: 2,
  format: "post",
  lengthMs: 15000,
  echoes: false,
  emphasis: ["w1", "w9", "w21"],
  background: { kind: "colour", colour: "#2E3A4A" },
  pattern: "dots",
  patternStrength: 65,
  lineColours: { 0: "#C0392B", 3: "#2F5D8A" },
  emphasisColour: "#E8B84A",
};

const roundTrip = (state: ShareState) => {
  const decoded = decodeShare(encodeShare(state));
  if (!decoded.ok) throw new Error(`decode failed: ${decoded.reason}`);
  return decoded.state;
};

describe("share links: round trip", () => {
  it("restores every field exactly", () => {
    expect(roundTrip(base)).toEqual(base);
  });

  it.each(MOOD_IDS)("keeps mood %s", (mood) => {
    expect(roundTrip({ ...base, mood }).mood).toBe(mood);
  });

  it.each([0, 1, 2])("keeps palette variant %i", (paletteVariant) => {
    expect(roundTrip({ ...base, paletteVariant }).paletteVariant).toBe(paletteVariant);
  });

  it.each(["reel", "post"] as const)("keeps format %s", (format) => {
    expect(roundTrip({ ...base, format }).format).toBe(format);
  });

  it.each(["above", "footer", "hidden"] as const)("keeps title placement %s", (titlePlacement) => {
    expect(roundTrip({ ...base, titlePlacement }).titlePlacement).toBe(titlePlacement);
  });

  it.each([null, 7000, 15000, 30000, 60000, 22000])("keeps length %s", (lengthMs) => {
    expect(roundTrip({ ...base, lengthMs }).lengthMs).toBe(lengthMs);
  });

  it.each([true, false])("keeps echoes %s", (echoes) => {
    expect(roundTrip({ ...base, echoes }).echoes).toBe(echoes);
  });

  it("keeps an empty title, an empty byline and no emphasis", () => {
    expect(roundTrip({ ...base, title: "", byline: "", emphasis: [] })).toMatchObject({ title: "", byline: "", emphasis: [] });
  });

  it("keeps the emphasis ids in order", () => {
    expect(roundTrip({ ...base, emphasis: ["w30", "w2", "w11"] }).emphasis).toEqual(["w30", "w2", "w11"]);
  });

  it("keeps unicode: accents, emoji, curly quotes, em dashes, CRLF and trailing spaces", () => {
    const poem = "café naïve 🌊\r\n“quoted” — dash   \n\n\nlast";
    expect(roundTrip({ ...base, poem, title: "“Tîtle”", byline: "— Émilie" })).toMatchObject({ poem, title: "“Tîtle”", byline: "— Émilie" });
  });

  it("keeps the sample poems", () => {
    for (const sample of SAMPLES) expect(roundTrip({ ...base, poem: sample.poem }).poem).toBe(sample.poem);
  });

  it("keeps a maximum-size poem", () => {
    const poem = Array.from({ length: 40 }, (_, i) => `the quiet rain keeps falling slow ${i + 1}`).join("\n").slice(0, LIMITS.poem);
    expect(roundTrip({ ...base, poem }).poem).toBe(poem);
  });

  it("produces a URL-safe payload and a compact link", () => {
    const payload = encodeShare(base);
    expect(payload).toMatch(/^[A-Za-z0-9+\-$]+$/);
    expect(payload.length).toBeLessThan(JSON.stringify(base).length);
    expect(payload).not.toContain("%");
  });

  it("is deterministic", () => {
    expect(encodeShare(base)).toBe(encodeShare({ ...base }));
  });
});

describe("share links: the hash", () => {
  it("builds and reads back #p=...", () => {
    const hash = shareHash(base);
    expect(hash.startsWith("#p=")).toBe(true);
    const payload = readShareHash(hash);
    expect(payload).toBe(encodeShare(base));
    expect(decodeShare(payload)).toMatchObject({ ok: true, state: base });
  });

  it("reads a hash with or without the leading #, and ignores other hashes", () => {
    expect(readShareHash("p=abc")).toBe("abc");
    expect(readShareHash("#p=abc")).toBe("abc");
    expect(readShareHash("#something-else")).toBeNull();
    expect(readShareHash("")).toBeNull();
  });
});

describe("share links: broken links", () => {
  it("reports an empty link", () => {
    for (const payload of ["", "   ", null, undefined]) expect(decodeShare(payload)).toMatchObject({ ok: false, reason: "empty" });
  });

  it("reports a corrupted link (half the hash deleted) without throwing", () => {
    const payload = encodeShare(base);
    for (const cut of [payload.slice(0, Math.floor(payload.length / 2)), payload.slice(5), payload.slice(0, 8)]) {
      const result = decodeShare(cut);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(["corrupt", "invalid", "version"]).toContain(result.reason);
        expect(result.message.length).toBeGreaterThan(10);
      }
    }
  });

  it("reports garbage and non-JSON payloads", () => {
    for (const payload of ["not a link at all", "!!!###", "N4Ig", compressToEncodedURIComponent("plain text, not json"), compressToEncodedURIComponent("[1,2,3]"), compressToEncodedURIComponent("null")]) {
      expect(decodeShare(payload)).toMatchObject({ ok: false, reason: "corrupt" });
    }
  });

  it("recognises an unknown version and recovers the poem from it", () => {
    const future = compressToEncodedURIComponent(JSON.stringify({ v: SHARE_VERSION + 1, p: "a poem from the future", mood: "Tender" }));
    const result = decodeShare(future);
    expect(result).toMatchObject({ ok: false, reason: "version", poem: "a poem from the future" });
    if (!result.ok) expect(result.message).toMatch(/different version/i);
  });

  it("treats a missing version as an old link too", () => {
    const old = compressToEncodedURIComponent(JSON.stringify({ p: "an old poem" }));
    expect(decodeShare(old)).toMatchObject({ ok: false, reason: "version", poem: "an old poem" });
  });

  it("rejects bad field values but still recovers the poem", () => {
    const bad = (patch: Record<string, unknown>) =>
      decodeShare(compressToEncodedURIComponent(JSON.stringify({ v: SHARE_VERSION, p: "keep me", t: "", tp: "above", b: "", m: "Tender", pv: 0, f: "reel", l: null, e: 1, em: [], ...patch })));
    for (const patch of [{ m: "Furious" }, { tp: "sideways" }, { f: "square" }, { pv: 7 }, { pv: 1.5 }, { l: 5 }, { l: 99999999 }, { l: "15" }, { e: 2 }, { em: ["w1", "oops"] }, { em: "w1" }, { t: "x".repeat(LIMITS.title + 1) }, { b: "x".repeat(LIMITS.byline + 1) }]) {
      const result = bad(patch);
      expect(result.ok, JSON.stringify(patch)).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("invalid");
        expect(result.poem).toBe("keep me");
      }
    }
  });

  it("does not recover a poem that is itself invalid", () => {
    const withPoem = (p: unknown) => decodeShare(compressToEncodedURIComponent(JSON.stringify({ v: 99, p })));
    expect(withPoem("")).toMatchObject({ ok: false, poem: undefined });
    expect(withPoem(42)).toMatchObject({ ok: false, poem: undefined });
    expect(withPoem("x".repeat(LIMITS.poem + 1))).toMatchObject({ ok: false, poem: undefined });
  });

  it("refuses absurdly large payloads instead of working on them", () => {
    expect(decodeShare("A".repeat(50_000))).toMatchObject({ ok: false, reason: "corrupt" });
    const huge = compressToEncodedURIComponent(JSON.stringify({ v: 1, p: "x".repeat(200_000) }));
    expect(decodeShare(huge).ok).toBe(false);
  });

  it("ignores unknown extra fields (forward compatible within a version)", () => {
    const payload = compressToEncodedURIComponent(JSON.stringify({ v: 1, p: "hello", t: "", tp: "footer", b: "", m: "Joyful", pv: 1, f: "reel", l: null, e: 1, em: [], extra: "ignored" }));
    expect(decodeShare(payload)).toMatchObject({ ok: true, state: { poem: "hello", mood: "Joyful" } });
  });

  it("never throws on random input", () => {
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-$%";
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    for (let i = 0; i < 200; i++) {
      const payload = Array.from({ length: 1 + (next() % 120) }, () => alphabet[next() % alphabet.length]).join("");
      expect(() => decodeShare(payload)).not.toThrow();
    }
  });
});
