import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { describe, expect, it } from "vitest";
import { analyzePoem, toPublicProsody } from "@/lib/prosody";
import { DEFAULT_SETTINGS, settingsFromShare, toShareState } from "@/lib/editor/settings";
import { fallbackAnalysis } from "@/lib/ai/fallback";
import { decodeShare, encodeShare, SHARE_VERSION, type ShareState } from "@/lib/share/encode";
import { LAMP_ABAB } from "../fixtures/poems";

const base: ShareState = {
  poem: "The lamp burns low beside the door,\nthe kettle hums a quiet tune,",
  title: "A Patient Moon",
  titlePlacement: "above",
  byline: "Dhwanit Shah",
  mood: "Tender",
  paletteVariant: 1,
  format: "reel",
  lengthMs: 15000,
  echoes: true,
  emphasis: ["w1", "w9"],
  background: { kind: "colour", colour: "#C9D3C3" },
  pattern: "dots",
  patternStrength: 40,
  lineColours: { 1: "#2F5D8A" },
  emphasisColour: "#8B1A1A",
  mark: true,
  readWithAi: true,
};

const ok = (payload: string) => {
  const result = decodeShare(payload);
  if (!result.ok) throw new Error(`decode failed: ${result.reason} ${result.message}`);
  return result;
};
/** A link as an older build wrote it: short keys, no `ai` key. */
const link = (v: number, extra: Record<string, unknown> = {}) =>
  compressToEncodedURIComponent(
    JSON.stringify({ v, p: "hello there", t: "T", tp: "above", b: "me", m: "Joyful", pv: 2, f: "post", l: 30000, e: 0, em: ["w2"], bg: "c", bc: "#C9D3C3", pt: "grid", ps: 60, lc: { 0: "#112233" }, ec: "#8B1A1A", mk: 0, ...extra }),
  );

describe("share links v4: Read with AI", () => {
  it("writes version 4", () => {
    expect(SHARE_VERSION).toBe(4);
    expect(ok(encodeShare(base)).version).toBe(4);
  });

  it.each([true, false])("round-trips readWithAi = %s with every other field untouched", (readWithAi) => {
    expect(ok(encodeShare({ ...base, readWithAi })).state).toEqual({ ...base, readWithAi });
  });

  it("writes the switch as 0 or 1 under the short key `ai`", () => {
    const wire = (state: ShareState) => JSON.parse(decompressFromEncodedURIComponent(encodeShare(state)) ?? "{}");
    expect(wire({ ...base, readWithAi: false }).ai).toBe(0);
    expect(wire({ ...base, readWithAi: true }).ai).toBe(1);
  });

  it.each([1, 2, 3])("a version %i link migrates with Read with AI ON and every other field exactly as it was", (v) => {
    const result = ok(link(v));
    expect(result.version).toBe(v);
    expect(result.state.readWithAi).toBe(true);
    // v1 ignores every later field, so only compare what each version really carries
    if (v >= 3) expect(result.state.mark).toBe(false);
    if (v >= 2) expect(result.state).toMatchObject({ pattern: "grid", patternStrength: 60, background: { kind: "colour", colour: "#C9D3C3" }, emphasisColour: "#8B1A1A" });
    expect(result.state).toMatchObject({ poem: "hello there", title: "T", mood: "Joyful", format: "post", lengthMs: 30000, echoes: false, emphasis: ["w2"] });
  });

  it("ignores an `ai` key in an older link: it cannot change what that link meant", () => {
    for (const v of [1, 2, 3]) expect(ok(link(v, { ai: 0 })).state.readWithAi).toBe(true);
  });

  it("a migrated v3 state re-encodes as v4 and round-trips unchanged", () => {
    const migrated = ok(link(3)).state;
    const again = ok(encodeShare(migrated));
    expect(again.version).toBe(4);
    expect(again.state).toEqual(migrated);
  });

  it("a v4 link without the key means on; a bad value is an invalid link that still gives back the poem", () => {
    expect(ok(link(4)).state.readWithAi).toBe(true);
    for (const ai of [2, "1", true, null, -1]) {
      expect(decodeShare(link(4, { ai })), JSON.stringify(ai)).toMatchObject({ ok: false, reason: "invalid", poem: "hello there" });
    }
  });

  it("explicit 0 and 1 are read", () => {
    expect(ok(link(4, { ai: 0 })).state.readWithAi).toBe(false);
    expect(ok(link(4, { ai: 1 })).state.readWithAi).toBe(true);
  });

  it("a version from the future is still refused, with the poem recovered", () => {
    expect(decodeShare(link(5))).toMatchObject({ ok: false, reason: "version", poem: "hello there" });
  });
});

describe("Read with AI in the editor settings", () => {
  const prosody = toPublicProsody(analyzePoem(LAMP_ABAB));
  const analysis = fallbackAnalysis(prosody);

  it("is ON by default", () => {
    expect(DEFAULT_SETTINGS.readWithAi).toBe(true);
  });

  it("goes into the share state and comes back out of it", () => {
    for (const readWithAi of [true, false]) {
      const shared = toShareState(LAMP_ABAB, { ...DEFAULT_SETTINGS, readWithAi }, analysis, prosody);
      expect(shared.readWithAi).toBe(readWithAi);
      expect(settingsFromShare(shared).readWithAi).toBe(readWithAi);
    }
  });
});

