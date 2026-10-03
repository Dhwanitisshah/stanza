import { compressToEncodedURIComponent } from "lz-string";
import { describe, expect, it } from "vitest";
import { MOOD_IDS } from "@/lib/moods/ids";
import { PATTERN_IDS } from "@/lib/render/patterns";
import { decodeShare, encodeShare, IMAGE_NOTICE, LIMITS, SHARE_VERSION, type ShareState } from "@/lib/share/encode";

const full: ShareState = {
  poem: "The lamp burns low beside the door,\nthe kettle hums a quiet tune,",
  title: "A Patient Moon",
  titlePlacement: "footer",
  byline: "Dhwanit Shah",
  mood: "Restless",
  paletteVariant: 1,
  format: "post",
  lengthMs: 30000,
  echoes: false,
  emphasis: ["w1", "w9"],
  background: { kind: "colour", colour: "#C9D3C3" },
  pattern: "notebook",
  patternStrength: 35,
  lineColours: { 0: "#C0392B", 1: "#2F5D8A", 39: "#4F7A5A" },
  emphasisColour: "#8B1A1A",
};

const wire = (patch: Record<string, unknown> = {}) =>
  compressToEncodedURIComponent(
    JSON.stringify({ v: 2, p: "keep me", t: "", tp: "above", b: "", m: "Tender", pv: 0, f: "reel", l: null, e: 1, em: [], bg: "m", pt: "none", ps: 50, lc: {}, ec: null, ...patch }),
  );
const ok = (payload: string) => {
  const result = decodeShare(payload);
  if (!result.ok) throw new Error(`decode failed: ${result.reason} ${result.message}`);
  return result;
};

describe("share links v2: round trip", () => {
  it("writes version 2", () => {
    expect(SHARE_VERSION).toBe(2);
    expect(ok(encodeShare(full)).version).toBe(2);
  });

  it("restores EVERY field exactly, including the new ones", () => {
    const result = ok(encodeShare(full));
    expect(result.state).toEqual(full);
    expect(result.notices).toEqual([]);
  });

  it.each(PATTERN_IDS)("keeps pattern %s", (pattern) => {
    expect(ok(encodeShare({ ...full, pattern })).state.pattern).toBe(pattern);
  });

  it.each([0, 1, 35, 50, 100])("keeps pattern strength %i", (patternStrength) => {
    expect(ok(encodeShare({ ...full, patternStrength })).state.patternStrength).toBe(patternStrength);
  });

  it("keeps a background colour, in capitals, and the mood paper", () => {
    expect(ok(encodeShare({ ...full, background: { kind: "colour", colour: "#2e3a4a" } })).state.background).toEqual({ kind: "colour", colour: "#2E3A4A" });
    expect(ok(encodeShare({ ...full, background: { kind: "mood" } })).state.background).toEqual({ kind: "mood" });
  });

  it("keeps line colours for several lines, none, and the highest allowed line", () => {
    expect(ok(encodeShare({ ...full, lineColours: {} })).state.lineColours).toEqual({});
    expect(ok(encodeShare({ ...full, lineColours: { 99: "#112233" } })).state.lineColours).toEqual({ 99: "#112233" });
    expect(ok(encodeShare(full)).state.lineColours).toEqual(full.lineColours);
  });

  it("keeps the emphasis colour, or none", () => {
    expect(ok(encodeShare({ ...full, emphasisColour: null })).state.emphasisColour).toBeNull();
    expect(ok(encodeShare({ ...full, emphasisColour: "#e8b84a" })).state.emphasisColour).toBe("#E8B84A");
  });

  it.each(MOOD_IDS)("keeps the mood %s together with all the new fields", (mood) => {
    expect(ok(encodeShare({ ...full, mood })).state).toEqual({ ...full, mood });
  });

  it("keeps the new fields together with unicode in the poem", () => {
    const poem = "café 🌊\n“quoted” — dash";
    expect(ok(encodeShare({ ...full, poem })).state).toEqual({ ...full, poem });
  });

  it("stays compact and URL-safe with every field set", () => {
    const payload = encodeShare(full);
    expect(payload).toMatch(/^[A-Za-z0-9+\-$]+$/);
    expect(payload.length).toBeLessThan(600);
  });
});

describe("share links v2: photo backgrounds", () => {
  const withPhoto: ShareState = { ...full, background: { kind: "image", darken: 0.6 } };

  it("never puts the photo in the link, and says so when it is opened: the mood's paper, with one notice", () => {
    const result = ok(encodeShare(withPhoto));
    expect(result.state.background).toEqual({ kind: "mood" });
    expect(result.notices).toEqual([IMAGE_NOTICE]);
    expect(IMAGE_NOTICE).toMatch(/photo/i);
    expect(IMAGE_NOTICE.split(". ").length).toBeLessThanOrEqual(2); // a one-line notice
  });

  it("keeps everything else about the poster when the photo is dropped", () => {
    const { background, ...rest } = ok(encodeShare(withPhoto)).state;
    const { background: _unused, ...expected } = full;
    void background;
    void _unused;
    expect(rest).toEqual(expected);
  });

  it("the link is no bigger because of a photo (there are no pixels in it)", () => {
    expect(encodeShare(withPhoto).length).toBeLessThanOrEqual(encodeShare(full).length + 10);
  });

  it("accepts every darkening from 0 to 80 percent, and rejects values outside it", () => {
    for (const bd of [0, 35, 80]) expect(decodeShare(wire({ bg: "i", bd })).ok).toBe(true);
    for (const bd of [-1, 81, 500, "50", null]) expect(decodeShare(wire({ bg: "i", bd }))).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("share links v1: migration", () => {
  const v1 = (patch: Record<string, unknown> = {}) =>
    compressToEncodedURIComponent(
      JSON.stringify({ v: 1, p: "The lamp burns low", t: "A Patient Moon", tp: "above", b: "me", m: "Tender", pv: 1, f: "reel", l: 15000, e: 1, em: ["w1", "w3"], ...patch }),
    );

  it("a version 1 link still opens", () => {
    const result = ok(v1());
    expect(result.version).toBe(1);
  });

  it("keeps every version 1 field exactly", () => {
    expect(ok(v1()).state).toMatchObject({
      poem: "The lamp burns low",
      title: "A Patient Moon",
      titlePlacement: "above",
      byline: "me",
      mood: "Tender",
      paletteVariant: 1,
      format: "reel",
      lengthMs: 15000,
      echoes: true,
      emphasis: ["w1", "w3"],
    });
  });

  it("fills in the version 2 fields with their defaults: the mood's paper, no pattern, no colours", () => {
    const { state, notices } = ok(v1());
    expect(state.background).toEqual({ kind: "mood" });
    expect(state.pattern).toBe("none");
    expect(state.patternStrength).toBe(50);
    expect(state.lineColours).toEqual({});
    expect(state.emphasisColour).toBeNull();
    expect(notices).toEqual([]);
  });

  it("migrates every combination of version 1 settings without loss", () => {
    for (const mood of MOOD_IDS) {
      for (const format of ["reel", "post"]) {
        for (const l of [null, 7000, 60000]) {
          const { state } = ok(v1({ m: mood, f: format, l, e: 0, tp: "hidden" }));
          expect(state).toMatchObject({ mood, format, lengthMs: l, echoes: false, titlePlacement: "hidden" });
        }
      }
    }
  });

  it("a migrated state encodes as version 2 and round-trips to the same state", () => {
    const migrated = ok(v1()).state;
    const again = ok(encodeShare(migrated));
    expect(again.version).toBe(2);
    expect(again.state).toEqual(migrated);
  });

  it("ignores version 2 fields that a version 1 link should not have (they cannot change what it means)", () => {
    const result = ok(v1({ bg: "c", bc: "#FF0000", pt: "grid", ps: 90, lc: { 0: "#FF0000" }, ec: "#00FF00" }));
    expect(result.state.background).toEqual({ kind: "mood" });
    expect(result.state.pattern).toBe("none");
    expect(result.state.lineColours).toEqual({});
  });

  it("still validates the version 1 fields themselves", () => {
    for (const patch of [{ m: "Furious" }, { f: "square" }, { l: 5 }, { em: ["oops"] }, { pv: 7 }]) {
      expect(decodeShare(v1(patch)), JSON.stringify(patch)).toMatchObject({ ok: false, reason: "invalid", poem: "The lamp burns low" });
    }
  });

  it("opens a real link that an old build wrote (the exact wire format)", () => {
    // Written by the Phase 5a build: version 1, short keys, no version 2 keys at all.
    const oldPayload = compressToEncodedURIComponent('{"v":1,"p":"hello there","t":"","tp":"above","b":"","m":"Joyful","pv":2,"f":"post","l":null,"e":1,"em":[]}');
    expect(ok(oldPayload).state).toMatchObject({ poem: "hello there", mood: "Joyful", paletteVariant: 2, format: "post", lengthMs: null, pattern: "none" });
  });
});

describe("share links v2: validation of the new fields", () => {
  const bad = (patch: Record<string, unknown>) => decodeShare(wire(patch));

  it("rejects bad background values", () => {
    for (const patch of [{ bg: "x" }, { bg: "c" }, { bg: "c", bc: "red" }, { bg: "c", bc: "#FFF" }, { bg: "c", bc: 5 }, { bg: 7 }]) {
      const result = bad(patch);
      expect(result.ok, JSON.stringify(patch)).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("invalid");
        expect(result.poem).toBe("keep me");
      }
    }
  });

  it("rejects bad pattern values", () => {
    for (const patch of [{ pt: "spiral" }, { pt: 3 }, { ps: -1 }, { ps: 101 }, { ps: "50" }, { ps: NaN }]) {
      expect(bad(patch), JSON.stringify(patch)).toMatchObject({ ok: false, reason: "invalid" });
    }
  });

  it("rejects bad line colours: wrong shape, bad hex, a line number out of range, or far too many", () => {
    const tooMany = Object.fromEntries(Array.from({ length: LIMITS.lines + 1 }, (_, i) => [i, "#112233"]));
    for (const patch of [{ lc: [] }, { lc: "x" }, { lc: { 0: "red" } }, { lc: { a: "#112233" } }, { lc: { 100: "#112233" } }, { lc: { "-1": "#112233" } }, { lc: { 0: 5 } }, { lc: tooMany }]) {
      expect(bad(patch), JSON.stringify(patch)).toMatchObject({ ok: false, reason: "invalid" });
    }
  });

  it("rejects a bad emphasis colour", () => {
    for (const patch of [{ ec: "gold" }, { ec: "#12345" }, { ec: 7 }]) expect(bad(patch)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("treats missing version 2 fields as defaults (so a minimal link works)", () => {
    const minimal = compressToEncodedURIComponent(JSON.stringify({ v: 2, p: "hi", t: "", tp: "above", b: "", m: "Tender", pv: 0, f: "reel", l: null, e: 1, em: [] }));
    expect(ok(minimal).state).toMatchObject({ background: { kind: "mood" }, pattern: "none", patternStrength: 50, lineColours: {}, emphasisColour: null });
  });

  it("still calls any other version an unknown one, and recovers the poem", () => {
    for (const v of [0, 3, 99, "2"]) {
      expect(decodeShare(wire({ v }))).toMatchObject({ ok: false, reason: "version", poem: "keep me" });
    }
  });

  it("never throws on random data", () => {
    let seed = 11;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    const junk = [null, 5, "x", [], {}, "#12", true, { a: 1 }];
    for (let i = 0; i < 200; i++) {
      const patch = { bg: junk[next() % junk.length], pt: junk[next() % junk.length], lc: junk[next() % junk.length], ec: junk[next() % junk.length], ps: junk[next() % junk.length] };
      expect(() => bad(patch)).not.toThrow();
    }
  });
});
