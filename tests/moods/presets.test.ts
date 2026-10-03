import { describe, expect, it } from "vitest";
import { DISTINCTNESS_ATTRIBUTES, differingAttributes, emphasisKind, moodAttributes, tempoBucket } from "@/lib/moods/attributes";
import { contrastRatio, hexToRgb, isDarkBackground, luminance } from "@/lib/moods/contrast";
import { MOOD_IDS } from "@/lib/moods/ids";
import { getMoodPreset, MOOD_PRESETS } from "@/lib/moods/presets";
import type { MoodPreset, Palette } from "@/lib/moods/types";

const presets = MOOD_IDS.map((id) => MOOD_PRESETS[id]);
const allPalettes = presets.flatMap((p) => p.palettes.map((palette, variant) => ({ mood: p, palette, name: `${p.id}[${variant}]` })));

describe("contrast maths", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("is symmetric and rejects bad input", () => {
    expect(contrastRatio("#123456", "#ABCDEF")).toBeCloseTo(contrastRatio("#ABCDEF", "#123456"), 10);
    expect(() => hexToRgb("red")).toThrow();
    expect(() => hexToRgb("#FFF")).toThrow();
  });

  it("tells dark backgrounds from light ones", () => {
    expect(isDarkBackground("#0E0D0B")).toBe(true);
    expect(isDarkBackground("#F7EDE8")).toBe(false);
  });
});

describe("presets: structure", () => {
  it("has exactly the six moods, and each preset knows its own id", () => {
    expect(Object.keys(MOOD_PRESETS).sort()).toEqual([...MOOD_IDS].sort());
    for (const id of MOOD_IDS) expect(MOOD_PRESETS[id].id).toBe(id);
    expect(getMoodPreset("Reverent")).toBe(MOOD_PRESETS.Reverent);
  });

  it("gives every mood three palette variants, with all colours as #RRGGBB", () => {
    for (const { palette, name } of allPalettes) {
      for (const colour of [palette.background, palette.ink, palette.accent, palette.accent2 ?? palette.accent]) {
        expect(() => hexToRgb(colour), name).not.toThrow();
      }
    }
  });

  it("has sensible tempo, easing, texture and typography values", () => {
    for (const p of presets) {
      expect(p.beatMs, p.id).toBeGreaterThanOrEqual(150);
      expect(p.beatMs, p.id).toBeLessThanOrEqual(400);
      expect(p.easing[0] >= 0 && p.easing[0] <= 1 && p.easing[2] >= 0 && p.easing[2] <= 1, `${p.id} easing x in [0,1]`).toBe(true);
      expect(p.textureIntensity, p.id).toBeGreaterThanOrEqual(0);
      expect(p.textureIntensity, p.id).toBeLessThanOrEqual(1);
      expect(p.typography.lineHeight, p.id).toBeGreaterThanOrEqual(1.05);
      expect(p.emphasis.scale, p.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("matches the brief: tempo, alignment, entrance, fonts, echoes", () => {
    const by = MOOD_PRESETS;
    expect(by.Tender).toMatchObject({ beatMs: 240, entrance: "fade-rise", typography: { align: "center" } });
    expect(by.Melancholy).toMatchObject({ entrance: "drift", typography: { align: "left", weight: 300 } });
    expect(by.Defiant).toMatchObject({ entrance: "slam", typography: { align: "left", weight: 700 } });
    expect(by.Joyful).toMatchObject({ entrance: "fade-rise", typography: { align: "center" } });
    expect(by.Reverent).toMatchObject({ entrance: "ink-bleed", typography: { align: "center" } });
    expect(by.Restless).toMatchObject({ entrance: "typewriter", typography: { align: "left" } });
    expect(by.Melancholy.emphasis.underline).toBe(true);
    expect(by.Restless.emphasis.highlight).toBe(true);
    expect(by.Tender.emphasis.italic).toBe(true);
    expect(by.Defiant.emphasis.scale).toBeGreaterThanOrEqual(1.1);
    expect(new Set(presets.map((p) => p.echo.style))).toEqual(new Set(["pulse", "underline", "glow"]));
  });

  it("includes at least two dark-background moods", () => {
    const dark = presets.filter((p) => p.palettes.every((palette) => isDarkBackground(palette.background)));
    expect(dark.length).toBeGreaterThanOrEqual(2);
    expect(dark.map((p) => p.id)).toEqual(expect.arrayContaining(["Melancholy", "Reverent"]));
  });

  it("keeps every palette variant of a mood on the same side (all light or all dark)", () => {
    for (const p of presets) {
      expect(new Set(p.palettes.map((palette) => isDarkBackground(palette.background))).size, p.id).toBe(1);
    }
  });
});

describe("presets: contrast gates", () => {
  const inkContrast = (palette: Palette) => contrastRatio(palette.ink, palette.background);

  it.each(allPalettes)("ink on background is at least 7:1 ($name)", ({ palette }) => {
    expect(inkContrast(palette)).toBeGreaterThanOrEqual(7);
  });

  // A colour that is DRAWN AS TEXT or a line needs 3:1 against the paper. A colour that is a highlighter bar
  // behind the ink does not: what has to be readable there is the ink on the bar (7:1).
  const asBar = (mood: MoodPreset) => mood.emphasis.highlight;

  it.each(allPalettes)("accent colours on background are at least 3:1, unless the accent is a highlighter bar ($name)", ({ mood, palette }) => {
    if (asBar(mood)) expect(contrastRatio(palette.ink, palette.accent)).toBeGreaterThanOrEqual(7);
    else expect(contrastRatio(palette.accent, palette.background)).toBeGreaterThanOrEqual(3);
    if (palette.accent2) expect(contrastRatio(palette.accent2, palette.background)).toBeGreaterThanOrEqual(3);
  });

  it.each(allPalettes)("the colours actually used for emphasis and echoes are readable ($name)", ({ mood, palette }) => {
    const echoColour = palette[mood.echo.color] ?? palette.accent;
    expect(contrastRatio(echoColour, palette.background)).toBeGreaterThanOrEqual(3);
    if (asBar(mood)) {
      // Highlight emphasis: the word stays ink, the bar is the accent. Ink on the bar is the test.
      expect(mood.emphasis.color).toBe("ink");
      expect(contrastRatio(palette.ink, palette.accent)).toBeGreaterThanOrEqual(7);
    } else {
      const emphasisColour = palette[mood.emphasis.color] ?? palette.accent;
      expect(contrastRatio(emphasisColour, palette.background)).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives Restless a real yellow highlighter, and ink on it passes 7:1", () => {
    for (const palette of MOOD_PRESETS.Restless.palettes) {
      const [r, g, b] = hexToRgb(palette.accent);
      expect(r).toBeGreaterThan(200);
      expect(g).toBeGreaterThan(190);
      expect(b).toBeLessThan(120); // yellow: lots of red and green, little blue
      expect(contrastRatio(palette.ink, palette.accent)).toBeGreaterThanOrEqual(7);
    }
  });

  it("fixes the old pale echo colour: nothing drawn as text or a line is lighter than 3:1 on its background", () => {
    // The Phase 3b problem: #D9BE98 on #F4EFE6 is about 1.5:1.
    expect(contrastRatio("#D9BE98", "#F4EFE6")).toBeLessThan(3);
    const worst = Math.min(
      ...allPalettes.flatMap(({ mood, palette }) =>
        [asBar(mood) ? null : palette.accent, palette.accent2].filter((c): c is string => typeof c === "string").map((c) => contrastRatio(c, palette.background)),
      ),
    );
    expect(worst).toBeGreaterThanOrEqual(3);
  });

  it("warmed Tender and Joyful toward the design: the sampled design colours are the first palettes", () => {
    expect(MOOD_PRESETS.Tender.palettes[0].background).toBe("#F3E9DC");
    expect(MOOD_PRESETS.Joyful.palettes[0].background).toBe("#F6D86B");
  });

  it("uses the line spacing from the design", () => {
    const heights = Object.fromEntries(MOOD_IDS.map((id) => [id, MOOD_PRESETS[id].typography.lineHeight]));
    expect(heights).toEqual({ Tender: 1.6, Melancholy: 1.65, Defiant: 1.25, Joyful: 1.5, Reverent: 1.55, Restless: 1.5 });
  });

  it("sets Melancholy in italic, and nobody else", () => {
    expect(MOOD_PRESETS.Melancholy.typography.italic).toBe(true);
    for (const id of MOOD_IDS.filter((m) => m !== "Melancholy")) expect(MOOD_PRESETS[id].typography.italic).toBeFalsy();
  });

  it("gives every mood the same footer treatment: a tracked title over an italic byline", () => {
    for (const p of presets) {
      expect(p.footer.trackingEm, p.id).toBeGreaterThan(0.1);
      expect(p.footer.weight, p.id).toBeGreaterThan(0);
      expect(p.footer.bylineWeight, p.id).toBeGreaterThan(0);
    }
  });
});

describe("presets: distinctness", () => {
  const pairs = presets.flatMap((a, i) => presets.slice(i + 1).map((b) => [a, b] as [MoodPreset, MoodPreset]));

  it.each(pairs)("$0.id and $1.id differ in at least 4 of 8 attributes", (a, b) => {
    const differing = differingAttributes(a, b);
    expect(differing.length, `${a.id} vs ${b.id} differ only in: ${differing.join(", ")}`).toBeGreaterThanOrEqual(4);
  });

  it("compares fifteen pairs across eight attributes", () => {
    expect(pairs).toHaveLength(15);
    expect(DISTINCTNESS_ATTRIBUTES).toHaveLength(8);
  });

  it("describes a mood in terms of what a viewer sees", () => {
    expect(moodAttributes(MOOD_PRESETS.Reverent)).toMatchObject({ font: "DM Serif Display", background: "dark", alignment: "center", entrance: "ink-bleed", echo: "glow" });
    expect(tempoBucket(190)).toBe("fast");
    expect(tempoBucket(240)).toBe("medium");
    expect(tempoBucket(300)).toBe("slow");
    expect(emphasisKind(MOOD_PRESETS.Restless)).toContain("highlight");
    expect(emphasisKind(MOOD_PRESETS.Tender)).toContain("italic");
  });

  it("is order independent", () => {
    for (const [a, b] of pairs) expect(differingAttributes(a, b)).toEqual(differingAttributes(b, a));
  });
});
