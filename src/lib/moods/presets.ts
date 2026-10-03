// The six moods. Each one must be recognisable at a glance: palette, typeface, motion, emphasis and echo all differ.
// Fonts are CSS variables set by next/font in app/layout.tsx; the browser resolves them before the canvas draws.
// Colour gates (enforced by tests/moods): ink on background >= 7:1, every accent >= 3:1.
import type { MoodId } from "./ids";
import type { MoodPreset } from "./types";

const font = (variable: string, family: string, fallback: string) => `var(--${variable}), "${family}", ${fallback}`;

const CORMORANT = font("font-cormorant", "Cormorant Garamond", "Georgia, serif");
const SPACE_GROTESK = font("font-space-grotesk", "Space Grotesk", "system-ui, sans-serif");
const FRAUNCES = font("font-fraunces", "Fraunces", "Georgia, serif");
const DM_SERIF = font("font-dm-serif", "DM Serif Display", "Georgia, serif");
const SPACE_MONO = font("font-space-mono", "Space Mono", "ui-monospace, monospace");
const INTER = font("font-inter", "Inter", "system-ui, sans-serif");

/** Warm paper, centred Cormorant, a soft rise. Emphasis leans into italic and a rose accent. */
export const TENDER: MoodPreset = {
  id: "Tender",
  label: "Tender",
  palettes: [
    { background: "#F3E9DC", ink: "#30251F", accent: "#B5614C", accent2: "#8C5A3C" },
    { background: "#F1E6D3", ink: "#33302A", accent: "#9A5F2B", accent2: "#7B4F6B" },
    { background: "#EAEDDF", ink: "#2F3A33", accent: "#4F7A5A", accent2: "#8A5A7A" },
  ],
  typography: { display: CORMORANT, body: INTER, weight: 500, lineHeight: 1.6, align: "center" },
  easing: [0.25, 0.1, 0.25, 1],
  entrance: "fade-rise",
  emphasis: { scale: 1.05, color: "accent", weight: 600, italic: true, underline: false, highlight: false },
  echo: { style: "pulse", color: "accent2" },
  footer: { weight: 500, bylineWeight: 400, trackingEm: 0.2 },
  textureIntensity: 0.25,
  beatMs: 240,
};

/** Dusk blue-grey, light italic Cormorant, slow downward drift. Emphasis draws an underline; echoes link by underline. */
export const MELANCHOLY: MoodPreset = {
  id: "Melancholy",
  label: "Melancholy",
  palettes: [
    { background: "#232A36", ink: "#D6DCE6", accent: "#8FB3D9", accent2: "#B7A6D9" },
    { background: "#1E2733", ink: "#D9DFE8", accent: "#7FB0C8", accent2: "#C2A8C9" },
    { background: "#2A2E3B", ink: "#DADCE8", accent: "#97A9E0", accent2: "#8CC2C2" },
  ],
  typography: { display: CORMORANT, body: INTER, weight: 300, italic: true, lineHeight: 1.65, align: "left" },
  easing: [0.22, 0.61, 0.36, 1],
  entrance: "drift",
  emphasis: { scale: 1, color: "accent", weight: 400, italic: true, underline: true, highlight: false },
  echo: { style: "underline", color: "accent2" },
  footer: { weight: 400, bylineWeight: 300, trackingEm: 0.2 },
  textureIntensity: 0.35,
  beatMs: 290,
};

/** Off-white, black ink, red accent, heavy grotesk. Words slam in; emphasis grows and turns red. */
export const DEFIANT: MoodPreset = {
  id: "Defiant",
  label: "Defiant",
  palettes: [
    { background: "#F2EFE9", ink: "#111111", accent: "#D61F1F", accent2: "#A31515" },
    { background: "#ECE8DF", ink: "#141414", accent: "#C8102E", accent2: "#8F1D1D" },
    { background: "#F7F5F0", ink: "#0E0E0E", accent: "#E02424", accent2: "#B21C1C" },
  ],
  typography: { display: SPACE_GROTESK, body: INTER, weight: 700, lineHeight: 1.25, align: "left" },
  easing: [0.3, 1.5, 0.5, 1],
  entrance: "slam",
  emphasis: { scale: 1.12, color: "accent", weight: 700, italic: false, underline: false, highlight: false },
  echo: { style: "pulse", color: "accent2" },
  footer: { weight: 500, bylineWeight: 500, trackingEm: 0.2 },
  textureIntensity: 0.15,
  beatMs: 200,
};

/** Butter yellow, centred Fraunces, a bouncy rise with overshoot. Emphasis is colour and weight; echoes glow. */
export const JOYFUL: MoodPreset = {
  id: "Joyful",
  label: "Joyful",
  palettes: [
    { background: "#F6D86B", ink: "#2B2208", accent: "#B3361B", accent2: "#1F6B9E" },
    { background: "#F8DE7E", ink: "#2A2410", accent: "#A8431A", accent2: "#7A2E8C" },
    { background: "#F3D25A", ink: "#262008", accent: "#C23B1E", accent2: "#17687A" },
  ],
  typography: { display: FRAUNCES, body: INTER, weight: 500, lineHeight: 1.5, align: "center" },
  easing: [0.34, 1.56, 0.64, 1],
  entrance: "fade-rise",
  emphasis: { scale: 1.06, color: "accent", weight: 800, italic: false, underline: false, highlight: false },
  echo: { style: "glow", color: "accent2" },
  footer: { weight: 500, bylineWeight: 500, trackingEm: 0.2 },
  textureIntensity: 0.12,
  beatMs: 210,
};

/** Near-black with gold, centred DM Serif Display, ink that bleeds from soft to sharp. Emphasis is gold; echoes glow. */
export const REVERENT: MoodPreset = {
  id: "Reverent",
  label: "Reverent",
  palettes: [
    { background: "#0E0D0B", ink: "#EDE6D3", accent: "#D4AF37", accent2: "#C9A24B" },
    { background: "#0B0B0F", ink: "#E8E4D8", accent: "#CFA93A", accent2: "#B8924A" },
    { background: "#12100D", ink: "#EFE8D6", accent: "#E0B94A", accent2: "#C79A3E" },
  ],
  typography: { display: DM_SERIF, body: INTER, weight: 400, lineHeight: 1.55, align: "center" },
  easing: [0.4, 0, 0.2, 1],
  entrance: "ink-bleed",
  emphasis: { scale: 1.04, color: "accent", weight: 400, italic: false, underline: false, highlight: false },
  echo: { style: "glow", color: "accent" },
  footer: { weight: 400, bylineWeight: 400, trackingEm: 0.2 },
  textureIntensity: 0.3,
  beatMs: 300,
};

/** Newsprint grey, left-aligned monospace typed out character by character. Emphasis is a yellow highlighter bar. */
export const RESTLESS: MoodPreset = {
  id: "Restless",
  label: "Restless",
  palettes: [
    { background: "#DAD6CE", ink: "#1B1B1B", accent: "#F0E442", accent2: "#2F5D8A" },
    { background: "#CFCBC2", ink: "#181818", accent: "#EBD83A", accent2: "#2B5580" },
    { background: "#DEDBD3", ink: "#1C1C1C", accent: "#F5E85A", accent2: "#3A5F7A" },
  ],
  typography: { display: SPACE_MONO, body: INTER, weight: 400, lineHeight: 1.5, align: "left" },
  easing: [0.5, 0, 0.5, 1],
  entrance: "typewriter",
  emphasis: { scale: 1, color: "ink", weight: 700, italic: false, underline: false, highlight: true },
  echo: { style: "underline", color: "accent2" },
  footer: { weight: 400, bylineWeight: 400, trackingEm: 0.2 },
  textureIntensity: 0.5,
  beatMs: 190,
  // Monospace is wide: allow a smaller size so a verse line stays on one row.
  minFontSize: 36,
};

export const MOOD_PRESETS: Record<MoodId, MoodPreset> = {
  Tender: TENDER,
  Melancholy: MELANCHOLY,
  Defiant: DEFIANT,
  Joyful: JOYFUL,
  Reverent: REVERENT,
  Restless: RESTLESS,
};

export function getMoodPreset(id: MoodId): MoodPreset {
  return MOOD_PRESETS[id] ?? TENDER;
}
