import { describe, expect, it } from "vitest";
import { contrastRatio, luminance } from "@/lib/moods/contrast";
import { MOOD_IDS } from "@/lib/moods/ids";
import { MOOD_PRESETS } from "@/lib/moods/presets";
import {
  autoInk,
  averageLuminance,
  COLOUR_SWATCHES,
  DARK_INK,
  DEFAULT_STYLING,
  defaultEmphasisColour,
  effectiveImageLuminance,
  greyHex,
  isHardToRead,
  isHexColour,
  LIGHT_INK,
  MAX_DARKEN,
  resolvePalette,
  type SceneStyling,
} from "@/lib/render/styling";

const colour = (hex: string): SceneStyling => ({ ...DEFAULT_STYLING, background: { kind: "colour", colour: hex } });
const image = (lum: number, darken = 0): SceneStyling => ({ ...DEFAULT_STYLING, background: { kind: "image", luminance: lum, darken } });

describe("luminance and contrast helpers", () => {
  it("match the WCAG reference values", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 6);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 4);
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
  });

  it("average the luminance of pixels (black, white, and a half-and-half mix)", () => {
    const black = [0, 0, 0, 255, 0, 0, 0, 255];
    const white = [255, 255, 255, 255, 255, 255, 255, 255];
    expect(averageLuminance(black)).toBe(0);
    expect(averageLuminance(white)).toBeCloseTo(1, 6);
    expect(averageLuminance([...black.slice(0, 4), ...white.slice(0, 4)])).toBeCloseTo(0.5, 6);
    expect(averageLuminance([])).toBe(0);
  });

  it("round-trip a luminance through a grey colour", () => {
    for (const lum of [0, 0.01, 0.18, 0.5, 0.9, 1]) expect(luminance(greyHex(lum))).toBeCloseTo(lum, 2);
    expect(greyHex(-5)).toBe("#000000");
    expect(greyHex(9)).toBe("#FFFFFF");
    expect(greyHex(NaN)).toBe("#000000");
  });

  it("accept only #RRGGBB as a colour", () => {
    expect(isHexColour("#A1b2C3")).toBe(true);
    for (const bad of ["#FFF", "red", "#GGGGGG", "A1B2C3", "", null, 5, "#A1B2C3FF"]) expect(isHexColour(bad)).toBe(false);
  });

  it("dim a photo's brightness by the darkening overlay, capped at the maximum", () => {
    expect(effectiveImageLuminance(0.8, 0)).toBeCloseTo(0.8);
    expect(effectiveImageLuminance(0.8, 0.5)).toBeCloseTo(0.4);
    expect(effectiveImageLuminance(0.8, 5)).toBeCloseTo(0.8 * (1 - MAX_DARKEN));
    expect(effectiveImageLuminance(0.8, -1)).toBeCloseTo(0.8);
  });
});

describe("automatic ink", () => {
  it("is dark on light and light on dark", () => {
    expect(autoInk(1)).toBe(DARK_INK);
    expect(autoInk(0.8)).toBe(DARK_INK);
    expect(autoInk(0)).toBe(LIGHT_INK);
    expect(autoInk(0.02)).toBe(LIGHT_INK);
  });

  it("always picks the ink with the better contrast, across the whole range of brightness", () => {
    for (let i = 0; i <= 100; i++) {
      const lum = i / 100;
      const bg = greyHex(lum);
      const chosen = contrastRatio(autoInk(lum), bg);
      const other = contrastRatio(autoInk(lum) === DARK_INK ? LIGHT_INK : DARK_INK, bg);
      expect(chosen, `luminance ${lum}`).toBeGreaterThanOrEqual(other - 1e-9);
    }
  });

  it("never does worse than 4:1, even on a mid-tone where neither ink is comfortable", () => {
    for (let i = 0; i <= 200; i++) expect(contrastRatio(autoInk(i / 200), greyHex(i / 200))).toBeGreaterThanOrEqual(3.9);
  });

  it("clamps nonsense luminance values", () => {
    expect(autoInk(-3)).toBe(LIGHT_INK);
    expect(autoInk(7)).toBe(DARK_INK);
    expect(autoInk(NaN)).toBe(LIGHT_INK);
  });

  it("gives all six colour swatches 7:1 or better with the automatic ink", () => {
    expect(COLOUR_SWATCHES).toHaveLength(6);
    for (const { name, colour: hex } of COLOUR_SWATCHES) {
      const ink = autoInk(luminance(hex));
      expect(contrastRatio(ink, hex), name).toBeGreaterThanOrEqual(7);
    }
  });
});

describe("resolvePalette", () => {
  const tender = MOOD_PRESETS.Tender;

  it("is the mood's own palette on the mood's paper", () => {
    for (const id of MOOD_IDS) {
      for (const variant of [0, 1, 2]) {
        const palette = resolvePalette(MOOD_PRESETS[id], variant);
        expect(palette).toMatchObject({ ...MOOD_PRESETS[id].palettes[variant], onImage: false });
      }
    }
  });

  it("falls back to variant 0 for a bad variant", () => {
    expect(resolvePalette(tender, 99).background).toBe(tender.palettes[2].background);
    expect(resolvePalette(tender, NaN).background).toBe(tender.palettes[0].background);
  });

  it("uses the chosen colour and switches the ink automatically", () => {
    const onSlate = resolvePalette(tender, 0, colour("#2E3A4A"));
    expect(onSlate.background).toBe("#2E3A4A");
    expect(onSlate.ink).toBe(LIGHT_INK);
    const onCream = resolvePalette(MOOD_PRESETS.Reverent, 0, colour("#F5EFE2")); // a dark mood on light paper
    expect(onCream.ink).toBe(DARK_INK);
  });

  it("keeps every accent readable (3:1) on any chosen colour, replacing it if it is not", () => {
    for (const id of MOOD_IDS) {
      const mood = MOOD_PRESETS[id];
      for (const { colour: hex } of COLOUR_SWATCHES) {
        const palette = resolvePalette(mood, 0, colour(hex));
        if (!mood.emphasis.highlight) expect(contrastRatio(palette.accent, hex), `${id} accent on ${hex}`).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(palette.accent2 ?? palette.ink, hex), `${id} accent2 on ${hex}`).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(palette.ink, hex), `${id} ink on ${hex}`).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it("leaves a highlighter's accent alone: it is a bar behind dark text, not text on the paper", () => {
    const restless = MOOD_PRESETS.Restless;
    expect(resolvePalette(restless, 0, colour("#2E3A4A")).accent).toBe(restless.palettes[0].accent);
  });

  it("chooses ink for a photo from how bright it is after darkening, and flags that it is a photo", () => {
    const bright = resolvePalette(tender, 0, image(0.8, 0));
    expect(bright).toMatchObject({ ink: DARK_INK, onImage: true });
    expect(resolvePalette(tender, 0, image(0.8, 0.8)).ink).toBe(LIGHT_INK); // a bright photo, darkened enough for light text
    expect(resolvePalette(tender, 0, image(0.1, 0)).ink).toBe(LIGHT_INK);
  });

  it("is deterministic", () => {
    expect(resolvePalette(tender, 1, colour("#C9D3C3"))).toEqual(resolvePalette(tender, 1, colour("#C9D3C3")));
  });
});

describe("hard-to-read warning", () => {
  it("warns when a colour is under 3:1 on the background", () => {
    const palette = resolvePalette(MOOD_PRESETS.Tender, 0);
    expect(isHardToRead("#E8DCCB", palette)).toBe(true); // paper on paper
    expect(isHardToRead("#3B2A2A", palette)).toBe(false);
    expect(isHardToRead(palette.background, palette)).toBe(true);
  });

  it("uses the threshold exactly: 3:1 passes, just under fails", () => {
    const palette = resolvePalette(MOOD_PRESETS.Tender, 0, colour("#FFFFFF"));
    expect(isHardToRead("#949494", palette)).toBe(false); // 3.03:1
    expect(isHardToRead("#9A9A9A", palette)).toBe(true); // 2.8:1
  });

  it("is skipped on photos, which vary across the frame", () => {
    const palette = resolvePalette(MOOD_PRESETS.Tender, 0, image(0.5, 0));
    expect(isHardToRead("#808080", palette)).toBe(false);
  });

  it("checks against the colour background too, not just the mood's paper", () => {
    const slate = resolvePalette(MOOD_PRESETS.Tender, 0, colour("#2E3A4A"));
    expect(isHardToRead("#2F3B4C", slate)).toBe(true);
    expect(isHardToRead("#F5EFE2", slate)).toBe(false);
  });
});

describe("default emphasis colour", () => {
  it("is the mood's emphasis colour, or the highlighter bar's colour", () => {
    const tender = MOOD_PRESETS.Tender;
    expect(defaultEmphasisColour(tender, resolvePalette(tender, 0))).toBe(tender.palettes[0].accent);
    const restless = MOOD_PRESETS.Restless;
    expect(defaultEmphasisColour(restless, resolvePalette(restless, 0))).toBe(restless.palettes[0].accent);
  });
});
