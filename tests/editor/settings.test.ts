import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, effectiveAnalysis, formatByline, LENGTH_PRESETS, lengthLabel, settingsFromShare, shownTitle, toShareState, type EditorSettings } from "@/lib/editor/settings";
import { buildScene } from "@/lib/render/scene";
import { decodeShare, encodeShare } from "@/lib/share/encode";
import { LAMP_ABAB, LETTERS_AABB } from "../fixtures/poems";
import { monospace, prepare } from "../helpers";

const { prosody, analysis } = prepare(LAMP_ABAB);

const custom: EditorSettings = {
  title: "A Patient Moon",
  titlePlacement: "above",
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

describe("effectiveAnalysis", () => {
  it("leaves Stanza's reading alone when nothing is overridden", () => {
    expect(effectiveAnalysis(analysis, DEFAULT_SETTINGS, prosody)).toEqual(analysis);
  });

  it("applies the user's mood, palette and emphasis", () => {
    const effective = effectiveAnalysis(analysis, custom, prosody);
    expect(effective).toMatchObject({ mood: "Reverent", paletteVariant: 2, emphasis: custom.emphasis });
    expect(effective.reading).toBe(analysis.reading);
  });

  it("drops emphasis ids that no longer exist instead of trusting them", () => {
    const effective = effectiveAnalysis(analysis, { ...custom, emphasis: ["w1", "w9999", "nonsense"] }, prosody);
    expect(effective.emphasis).toEqual(["w1"]);
  });

  it("an explicit empty emphasis means no emphasis (not 'use the AI pick')", () => {
    expect(effectiveAnalysis(analysis, { ...custom, emphasis: [] }, prosody).emphasis).toEqual([]);
    expect(effectiveAnalysis(analysis, { ...custom, emphasis: null }, prosody).emphasis).toEqual(analysis.emphasis);
  });
});

describe("share state", () => {
  it("resolves 'Stanza's read' into explicit values, so the link is exact", () => {
    const state = toShareState(LAMP_ABAB, DEFAULT_SETTINGS, analysis, prosody);
    expect(state).toMatchObject({ mood: analysis.mood, paletteVariant: analysis.paletteVariant, emphasis: analysis.emphasis, lengthMs: null, echoes: true, titlePlacement: "above" });
  });

  it("trims the title and byline", () => {
    const state = toShareState(LAMP_ABAB, { ...custom, title: "  Moon  ", byline: " me " }, analysis, prosody);
    expect(state).toMatchObject({ title: "Moon", byline: "me" });
  });

  it("settings survive link -> settings unchanged", () => {
    const state = toShareState(LAMP_ABAB, custom, analysis, prosody);
    expect(settingsFromShare(state)).toEqual({ ...custom, title: "A Patient Moon", byline: "Dhwanit Shah" });
  });

  it("encode -> decode -> settings gives the same settings, for every field", () => {
    const decoded = decodeShare(encodeShare(toShareState(LAMP_ABAB, custom, analysis, prosody)));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(settingsFromShare(decoded.state)).toEqual(custom);
  });
});

describe("a share link rebuilds the exact poster", () => {
  const sceneFor = (poem: string, settings: EditorSettings, from = prepare(poem)) =>
    buildScene({
      prosody: from.prosody,
      analysis: effectiveAnalysis(from.analysis, settings, from.prosody),
      format: settings.format,
      speed: 1,
      lengthMs: settings.lengthMs,
      title: settings.title.trim() || undefined,
      titlePlacement: settings.titlePlacement,
      byline: formatByline(settings.byline),
      echoes: settings.echoes,
      measureText: monospace,
    });

  it.each([
    ["lamp, customised", LAMP_ABAB, custom],
    ["lamp, defaults", LAMP_ABAB, DEFAULT_SETTINGS],
    ["aabb, footer title and 30 s", LETTERS_AABB, { ...custom, titlePlacement: "footer", lengthMs: 30000, mood: "Joyful", format: "reel" } as EditorSettings],
    ["aabb, hidden title and 60 s", LETTERS_AABB, { ...custom, titlePlacement: "hidden", lengthMs: 60000, mood: null, emphasis: null } as EditorSettings],
  ])("%s", (_name, poem, settings) => {
    const original = prepare(poem);
    const opened = decodeShare(encodeShare(toShareState(poem, settings, original.analysis, original.prosody)));
    if (!opened.ok) throw new Error("link did not decode");

    // What happens on opening a link: the poem is analysed again (skipAi), and the saved settings are applied.
    const reopened = prepare(opened.state.poem);
    const before = sceneFor(poem, settings, original);
    const after = sceneFor(opened.state.poem, settingsFromShare(opened.state), reopened);

    expect(after.layout).toEqual(before.layout);
    expect(after.timeline).toEqual(before.timeline);
    expect(after.mood.id).toBe(before.mood.id);
    expect(after.length).toEqual(before.length);
  });
});

describe("small helpers", () => {
  it("formatByline puts a dash in front, once", () => {
    expect(formatByline("Dhwanit Shah")).toBe("— Dhwanit Shah");
    expect(formatByline("  me ")).toBe("— me");
    expect(formatByline("— already")).toBe("— already");
    expect(formatByline("- hyphen")).toBe("- hyphen");
    expect(formatByline("   ")).toBeUndefined();
    expect(formatByline("")).toBeUndefined();
  });

  it("shows a title only when the user set one", () => {
    expect(shownTitle(DEFAULT_SETTINGS)).toBeUndefined();
    expect(shownTitle({ ...DEFAULT_SETTINGS, title: "   " })).toBeUndefined();
    expect(shownTitle({ ...DEFAULT_SETTINGS, title: " Moon " })).toBe("Moon");
  });

  it("offers Auto, 7, 15, 30 and 60 seconds", () => {
    expect(LENGTH_PRESETS).toEqual([null, 7000, 15000, 30000, 60000]);
    expect(LENGTH_PRESETS.map(lengthLabel)).toEqual(["Auto", "7 s", "15 s", "30 s", "60 s"]);
  });

  it("starts with the title above the poem, Auto length and echoes on", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ titlePlacement: "above", lengthMs: null, echoes: true, mood: null, emphasis: null, format: "reel" });
  });
});
