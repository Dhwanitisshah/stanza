import { compressToEncodedURIComponent } from "lz-string";
import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare, SHARE_VERSION, type ShareState } from "@/lib/share/encode";

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
};

const ok = (payload: string) => {
  const result = decodeShare(payload);
  if (!result.ok) throw new Error(`decode failed: ${result.reason} ${result.message}`);
  return result;
};
const link = (v: number, extra: Record<string, unknown> = {}) =>
  compressToEncodedURIComponent(
    JSON.stringify({ v, p: "hello there", t: "T", tp: "above", b: "me", m: "Joyful", pv: 2, f: "post", l: 30000, e: 0, em: ["w2"], bg: "c", bc: "#C9D3C3", pt: "grid", ps: 60, lc: { 0: "#112233" }, ec: "#8B1A1A", ...extra }),
  );

describe("share links v3: the made-with-Stanza mark", () => {
  it("writes version 3", () => {
    expect(SHARE_VERSION).toBe(3);
    expect(ok(encodeShare(base)).version).toBe(3);
  });

  it.each([true, false])("round-trips mark = %s with every other field untouched", (mark) => {
    expect(ok(encodeShare({ ...base, mark })).state).toEqual({ ...base, mark });
  });

  it("a version 2 link migrates: the mark is ON and every v2 field survives exactly", () => {
    const result = ok(link(2));
    expect(result.version).toBe(2);
    expect(result.state).toEqual({
      poem: "hello there",
      title: "T",
      titlePlacement: "above",
      byline: "me",
      mood: "Joyful",
      paletteVariant: 2,
      format: "post",
      lengthMs: 30000,
      echoes: false,
      emphasis: ["w2"],
      background: { kind: "colour", colour: "#C9D3C3" },
      pattern: "grid",
      patternStrength: 60,
      lineColours: { 0: "#112233" },
      emphasisColour: "#8B1A1A",
      mark: true,
    });
  });

  it("a version 1 link migrates with the mark on too", () => {
    const v1 = compressToEncodedURIComponent(JSON.stringify({ v: 1, p: "old", t: "", tp: "footer", b: "", m: "Tender", pv: 0, f: "reel", l: null, e: 1, em: [] }));
    expect(ok(v1).state.mark).toBe(true);
  });

  it("ignores a mark key in an older link (it cannot change what that link meant)", () => {
    expect(ok(link(2, { mk: 0 })).state.mark).toBe(true);
    expect(ok(link(1, { mk: 0 })).state.mark).toBe(true);
  });

  it("a migrated state re-encodes as version 3 and round-trips", () => {
    const migrated = ok(link(2)).state;
    const again = ok(encodeShare(migrated));
    expect(again.version).toBe(3);
    expect(again.state).toEqual(migrated);
  });

  it("a version 3 link without the key means on; a bad value is an invalid link that still gives back the poem", () => {
    expect(ok(link(3)).state.mark).toBe(true);
    for (const mk of [2, "1", true, null, -1]) {
      expect(decodeShare(link(3, { mk })), JSON.stringify(mk)).toMatchObject({ ok: false, reason: "invalid", poem: "hello there" });
    }
  });

  it("explicit 0 and 1 are read", () => {
    expect(ok(link(3, { mk: 0 })).state.mark).toBe(false);
    expect(ok(link(3, { mk: 1 })).state.mark).toBe(true);
  });
});
