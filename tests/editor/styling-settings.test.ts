import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  hasCustomStyling,
  remapEmphasis,
  remapLineColours,
  resetStyling,
  settingsFromShare,
  toggleImportantWord,
  toSceneStyling,
  toShareState,
  type EditorSettings,
} from "@/lib/editor/settings";
import { DEFAULT_STYLING } from "@/lib/render/styling";
import { decodeShare, encodeShare } from "@/lib/share/encode";
import { LAMP_ABAB } from "../fixtures/poems";
import { prepare } from "../helpers";

const { prosody, analysis } = prepare(LAMP_ABAB);

const custom: EditorSettings = {
  ...DEFAULT_SETTINGS,
  title: "A Patient Moon",
  byline: "Dhwanit Shah",
  mood: "Reverent",
  paletteVariant: 2,
  format: "post",
  lengthMs: 22000,
  echoes: false,
  emphasis: [prosody.stanzas[0].lines[0].words[1].id],
  background: { kind: "colour", colour: "#2E3A4A" },
  pattern: "grid",
  patternStrength: 70,
  lineColours: { 1: "#C0392B", 3: "#2F5D8A" },
  emphasisColour: "#E8B84A",
};

describe("styling settings", () => {
  const photo = { luminance: 0.4 };

  it("builds the scene styling: colour, pattern, line colours, emphasis colour", () => {
    expect(toSceneStyling(custom, photo)).toEqual({
      background: { kind: "colour", colour: "#2E3A4A" },
      pattern: { id: "grid", strength: 70 },
      lineColours: { 1: "#C0392B", 3: "#2F5D8A" },
      emphasisColour: "#E8B84A",
    });
  });

  it("uses a photo only when there is one, and caps the darkening", () => {
    const withPhoto = { ...custom, background: { kind: "image" as const, darken: 0.5 } };
    expect(toSceneStyling(withPhoto, photo).background).toEqual({ kind: "image", darken: 0.5, luminance: 0.4 });
    expect(toSceneStyling(withPhoto, null).background).toEqual({ kind: "mood" }); // no photo here: the mood's paper
    expect(toSceneStyling({ ...withPhoto, background: { kind: "image", darken: 3 } }, photo).background).toMatchObject({ darken: 0.8 });
  });

  it("starts with nothing customised", () => {
    expect(hasCustomStyling(DEFAULT_SETTINGS)).toBe(false);
    expect(toSceneStyling(DEFAULT_SETTINGS, null)).toEqual({ ...DEFAULT_STYLING, pattern: { id: "none", strength: 50 } });
  });

  it("sees any customisation: each one on its own", () => {
    for (const patch of [
      { background: { kind: "colour" as const, colour: "#FFFFFF" } },
      { pattern: "dots" as const },
      { lineColours: { 0: "#C0392B" } },
      { emphasisColour: "#E8B84A" },
      { emphasis: [] as string[] },
      { mood: "Joyful" as const },
      { paletteVariant: 2 },
    ]) {
      expect(hasCustomStyling({ ...DEFAULT_SETTINGS, ...patch }), JSON.stringify(patch)).toBe(true);
    }
    // These are settings but not styling.
    expect(hasCustomStyling({ ...DEFAULT_SETTINGS, title: "x", byline: "y", format: "post", lengthMs: 15000, echoes: false })).toBe(false);
  });

  it("reset clears every bit of styling and keeps the rest", () => {
    const reset = resetStyling(custom);
    expect(reset).toMatchObject({
      mood: null,
      paletteVariant: null,
      emphasis: null,
      emphasisColour: null,
      background: { kind: "mood" },
      pattern: "none",
      lineColours: {},
      title: custom.title,
      titlePlacement: custom.titlePlacement,
      byline: custom.byline,
      format: custom.format,
      lengthMs: custom.lengthMs,
      echoes: custom.echoes,
    });
    expect(hasCustomStyling(reset)).toBe(false);
  });

  it("reset does not share state with the defaults (changing the result must not change DEFAULT_SETTINGS)", () => {
    const reset = resetStyling(custom);
    reset.lineColours[5] = "#000000";
    expect(DEFAULT_SETTINGS.lineColours).toEqual({});
  });
});

describe("important words", () => {
  const pick = ["w1", "w9"];

  it("the first tap starts from Stanza's pick, so the user edits it rather than starting blank", () => {
    expect(toggleImportantWord(null, pick, "w3")).toEqual(["w1", "w9", "w3"]);
    expect(toggleImportantWord(null, pick, "w1")).toEqual(["w9"]);
  });

  it("after that, taps work on the user's own list", () => {
    expect(toggleImportantWord(["w3"], pick, "w3")).toEqual([]);
    expect(toggleImportantWord(["w3"], pick, "w4")).toEqual(["w3", "w4"]);
    expect(toggleImportantWord([], pick, "w1")).toEqual(["w1"]); // an empty list is the user's choice, not "use the pick"
  });

  it("never returns null and never changes its input", () => {
    const list = ["w2"];
    const out = toggleImportantWord(list, pick, "w5");
    expect(list).toEqual(["w2"]);
    expect(out).not.toBe(list);
  });
});

describe("keeping marks and colours attached to the right words after an edit", () => {
  const before = prepare("the lamp burns low\nbeside the door").prosody;
  const idOf = (p: typeof before, line: number, word: number) => p.stanzas.flatMap((s) => s.lines)[line].words[word].id;

  it("keeps a marked word that is still the same word in the same place", () => {
    const after = prepare("the lamp burns low\nbeside the door and more").prosody; // text added at the end
    expect(remapEmphasis(before, after, [idOf(before, 0, 1), idOf(before, 1, 2)])).toEqual([idOf(before, 0, 1), idOf(before, 1, 2)]);
  });

  it("drops a mark whose word changed, or moved", () => {
    const changed = prepare("the lamp glows low\nbeside the door").prosody; // "burns" -> "glows"
    expect(remapEmphasis(before, changed, [idOf(before, 0, 2), idOf(before, 0, 1)])).toEqual([idOf(before, 0, 1)]);
    const shifted = prepare("oh the lamp burns low\nbeside the door").prosody; // a word inserted at the start shifts every id
    expect(remapEmphasis(before, shifted, [idOf(before, 0, 1)])).toEqual([]);
  });

  it("drops marks that point at words that no longer exist", () => {
    const shorter = prepare("the lamp").prosody;
    expect(remapEmphasis(before, shorter, ["w5", "w1"])).toEqual(["w1"]);
    expect(remapEmphasis(before, shorter, ["w999"])).toEqual([]);
  });

  it("keeps a line colour only while that line still says the same thing", () => {
    const edited = prepare("the lamp burns low\nbeside the open door").prosody;
    expect(remapLineColours(before, edited, { 0: "#C0392B", 1: "#2F5D8A" })).toEqual({ 0: "#C0392B" });
    expect(remapLineColours(before, before, { 0: "#C0392B", 1: "#2F5D8A" })).toEqual({ 0: "#C0392B", 1: "#2F5D8A" });
  });

  it("drops colours for lines that are gone", () => {
    const shorter = prepare("the lamp burns low").prosody;
    expect(remapLineColours(before, shorter, { 1: "#2F5D8A" })).toEqual({});
  });

  it("is a no-op for nothing", () => {
    expect(remapEmphasis(before, before, [])).toEqual([]);
    expect(remapLineColours(before, before, {})).toEqual({});
  });
});

describe("share state carries the new fields", () => {
  it("records the look of the poster, and the link restores it", () => {
    const state = toShareState(LAMP_ABAB, custom, analysis, prosody);
    expect(state).toMatchObject({ background: custom.background, pattern: "grid", patternStrength: 70, lineColours: custom.lineColours, emphasisColour: "#E8B84A" });
    const decoded = decodeShare(encodeShare(state));
    if (!decoded.ok) throw new Error("did not decode");
    expect(settingsFromShare(decoded.state)).toMatchObject({ background: custom.background, pattern: "grid", patternStrength: 70, lineColours: custom.lineColours, emphasisColour: "#E8B84A" });
  });

  it("a photo background is written to the link as 'a photo was used' but opens on the mood's paper, with a notice", () => {
    const withPhoto = { ...custom, background: { kind: "image" as const, darken: 0.5 } };
    const decoded = decodeShare(encodeShare(toShareState(LAMP_ABAB, withPhoto, analysis, prosody)));
    if (!decoded.ok) throw new Error("did not decode");
    expect(decoded.state.background).toEqual({ kind: "mood" });
    expect(decoded.notices).toHaveLength(1);
    expect(decoded.notices[0]).toMatch(/photo/i);
    expect(settingsFromShare(decoded.state).background).toEqual({ kind: "mood" });
  });
});
