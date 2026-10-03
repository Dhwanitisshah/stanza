// The six mood ids. Client-safe (no server-only): presets.ts (Phase 4) builds on this list.
export const MOOD_IDS = ["Tender", "Melancholy", "Defiant", "Joyful", "Reverent", "Restless"] as const;

export type MoodId = (typeof MOOD_IDS)[number];
