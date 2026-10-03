import type { MoodId } from "./ids";
import type { MoodPreset } from "./types";

// Phase 3a ships ONE placeholder preset. The other five arrive in Phase 4.

export const TENDER: MoodPreset = {
  id: "Tender",
  label: "Tender",
  palettes: [
    { background: "#F7EDE8", ink: "#3B2A2A", accent: "#C4707A", accent2: "#E3A89F" },
    { background: "#F4EFE6", ink: "#33302A", accent: "#B98A5E", accent2: "#D9BE98" },
    { background: "#EEF0EA", ink: "#2F3A33", accent: "#7F9C84", accent2: "#B4C7B3" },
  ],
  typography: {
    display: '"Cormorant Garamond", Georgia, serif',
    body: '"Inter", system-ui, sans-serif',
    weight: 500,
    lineHeight: 1.35,
    align: "left",
  },
  easing: [0.25, 0.1, 0.25, 1],
  entrance: "fade-rise",
  emphasis: { scale: 1.08, color: "accent", weight: 700, underline: false },
  textureIntensity: 0.25,
  beatMs: 240,
};

const PRESETS: Partial<Record<MoodId, MoodPreset>> = { Tender: TENDER };

/** Until Phase 4, every mood without a preset of its own renders as Tender. */
export function getMoodPreset(id: MoodId): MoodPreset {
  return PRESETS[id] ?? TENDER;
}
