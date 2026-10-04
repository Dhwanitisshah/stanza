// The editor's settings model and how it maps to a poster and to a share link. Pure and client-safe.
import type { Analysis } from "@/lib/ai/schema";
import type { MoodId } from "@/lib/moods/ids";
import type { PublicProsody } from "@/lib/prosody";
import type { PatternId } from "@/lib/render/patterns";
import { DEFAULT_STYLING, MAX_DARKEN, type SceneStyling } from "@/lib/render/styling";
import type { FormatId, TitlePlacement } from "@/lib/render/types";
import type { ShareState } from "@/lib/share/encode";

/** What sits behind the poem. A photo's pixels are held separately by the editor; the setting only says "use it" and how dark. */
export type BackgroundChoice = { kind: "mood" } | { kind: "colour"; colour: string } | { kind: "image"; darken: number };

/** What the user can change. null means "leave it to Stanza's reading". */
export interface EditorSettings {
  title: string;
  titlePlacement: TitlePlacement;
  byline: string;
  mood: MoodId | null;
  paletteVariant: number | null;
  format: FormatId;
  /** Target length in ms; null = Auto. */
  lengthMs: number | null;
  echoes: boolean;
  /** Emphasised word ids; null = the AI's pick. */
  emphasis: string[] | null;
  background: BackgroundChoice;
  pattern: PatternId;
  /** 0..100. */
  patternStrength: number;
  /** Colour overrides by global line index. */
  lineColours: Record<number, string>;
  /** Colour of the emphasised words; null = the mood's own. */
  emphasisColour: string | null;
  /** The small "made with Stanza" mark in the bottom corner. On by default. */
  mark: boolean;
}

export const DEFAULT_DARKEN = 0.35;

export const DEFAULT_SETTINGS: EditorSettings = {
  title: "",
  titlePlacement: "above",
  byline: "",
  mood: null,
  paletteVariant: null,
  format: "reel",
  lengthMs: null,
  echoes: true,
  emphasis: null,
  background: { kind: "mood" },
  pattern: "none",
  patternStrength: 50,
  lineColours: {},
  emphasisColour: null,
  mark: true,
};

/** Length presets in ms; null is Auto. */
export const LENGTH_PRESETS: readonly (number | null)[] = [null, 7000, 15000, 30000, 60000];

export const lengthLabel = (ms: number | null) => (ms === null ? "Auto" : `${ms / 1000} s`);

/** The analysis with the user's overrides applied: this is what the poster is built from. */
export function effectiveAnalysis(analysis: Analysis, settings: Pick<EditorSettings, "mood" | "paletteVariant" | "emphasis">, prosody: PublicProsody): Analysis {
  const known = new Set(prosody.stanzas.flatMap((s) => s.lines.flatMap((l) => l.words.map((w) => w.id))));
  return {
    ...analysis,
    mood: settings.mood ?? analysis.mood,
    paletteVariant: settings.paletteVariant ?? analysis.paletteVariant,
    // Saved ids that no longer exist (the poem was edited) are dropped rather than trusted.
    emphasis: (settings.emphasis ?? analysis.emphasis).filter((id) => known.has(id)),
  };
}

/** The look of the poster for the scene builder. A photo background without a photo falls back to the mood's paper. */
export function toSceneStyling(
  settings: Pick<EditorSettings, "background" | "pattern" | "patternStrength" | "lineColours" | "emphasisColour">,
  image: { luminance: number } | null,
): SceneStyling {
  const { background } = settings;
  return {
    ...DEFAULT_STYLING,
    background:
      background.kind === "colour"
        ? { kind: "colour", colour: background.colour }
        : background.kind === "image" && image
          ? { kind: "image", darken: Math.min(MAX_DARKEN, Math.max(0, background.darken)), luminance: image.luminance }
          : { kind: "mood" },
    pattern: { id: settings.pattern, strength: settings.patternStrength },
    lineColours: settings.lineColours,
    emphasisColour: settings.emphasisColour,
  };
}

/**
 * Clears everything about the LOOK: mood, palette, background, photo, pattern, line colours, important words and
 * their colour. Title, byline, format, length, echoes and the mark are left alone: they are not styling.
 */
export function resetStyling(settings: EditorSettings): EditorSettings {
  const { background, pattern, patternStrength, lineColours, emphasisColour, emphasis, mood, paletteVariant } = DEFAULT_SETTINGS;
  return { ...settings, background, pattern, patternStrength, lineColours: { ...lineColours }, emphasisColour, emphasis, mood, paletteVariant };
}

/** True when anything about the look differs from Stanza's own reading (so "Reset styling" has something to do). */
export function hasCustomStyling(settings: EditorSettings): boolean {
  return (
    settings.background.kind !== "mood" ||
    settings.pattern !== "none" ||
    Object.keys(settings.lineColours).length > 0 ||
    settings.emphasisColour !== null ||
    settings.emphasis !== null ||
    settings.mood !== null ||
    settings.paletteVariant !== null
  );
}

const wordsById = (prosody: PublicProsody) => new Map(prosody.stanzas.flatMap((s) => s.lines.flatMap((l) => l.words.map((w) => [w.id, w.core.toLowerCase()] as const))));
const lineTexts = (prosody: PublicProsody) => prosody.stanzas.flatMap((s) => s.lines.map((l) => l.words.map((w) => w.text).join(" ")));

/**
 * After the poem is edited and read again, keep a marked word only if the same word is still at the same place.
 * (Word ids count words from the top, so inserting a word shifts everything after it.)
 */
export function remapEmphasis(previous: PublicProsody, next: PublicProsody, ids: string[]): string[] {
  const before = wordsById(previous);
  const after = wordsById(next);
  return ids.filter((id) => before.has(id) && before.get(id) === after.get(id));
}

/** Likewise for line colours: a colour stays only if its line still says the same thing. */
export function remapLineColours(previous: PublicProsody, next: PublicProsody, colours: Record<number, string>): Record<number, string> {
  const before = lineTexts(previous);
  const after = lineTexts(next);
  const kept: Record<number, string> = {};
  for (const [key, colour] of Object.entries(colours)) {
    const line = Number(key);
    if (before[line] !== undefined && before[line] === after[line]) kept[line] = colour;
  }
  return kept;
}

/**
 * Tapping a word marks it or unmarks it. The first tap starts from Stanza's pick, so the user edits it instead of
 * replacing it with a blank. Returns the new list of marked ids (never null: the user has now chosen).
 */
export function toggleImportantWord(current: string[] | null, aiPick: string[], wordId: string): string[] {
  const base = current ?? aiPick;
  return base.includes(wordId) ? base.filter((id) => id !== wordId) : [...base, wordId];
}

/** The share link state for what is on screen right now. */
export function toShareState(poem: string, settings: EditorSettings, analysis: Analysis, prosody: PublicProsody): ShareState {
  const effective = effectiveAnalysis(analysis, settings, prosody);
  return {
    poem,
    title: settings.title.trim(),
    titlePlacement: settings.titlePlacement,
    byline: settings.byline.trim(),
    mood: effective.mood,
    paletteVariant: effective.paletteVariant,
    format: settings.format,
    lengthMs: settings.lengthMs,
    echoes: settings.echoes,
    emphasis: effective.emphasis,
    background: settings.background,
    pattern: settings.pattern,
    patternStrength: settings.patternStrength,
    lineColours: settings.lineColours,
    emphasisColour: settings.emphasisColour,
    mark: settings.mark,
  };
}

/** Settings restored from a share link: every field is explicit, so the poster comes back exactly. */
export function settingsFromShare(state: ShareState): EditorSettings {
  return {
    title: state.title,
    titlePlacement: state.titlePlacement,
    byline: state.byline,
    mood: state.mood,
    paletteVariant: state.paletteVariant,
    format: state.format,
    lengthMs: state.lengthMs,
    echoes: state.echoes,
    emphasis: state.emphasis,
    background: state.background,
    pattern: state.pattern,
    patternStrength: state.patternStrength,
    lineColours: state.lineColours,
    emphasisColour: state.emphasisColour,
    mark: state.mark,
  };
}

/** The title to draw: only what the user set or accepted, never the suggestion on its own. */
export const shownTitle = (settings: EditorSettings): string | undefined => settings.title.trim() || undefined;

/** "Dhwanit Shah" -> "— Dhwanit Shah". A byline that already starts with a dash is left alone; blank means none. */
export function formatByline(text: string): string | undefined {
  const name = text.trim();
  if (!name) return undefined;
  return /^[—–-]/.test(name) ? name : `— ${name}`;
}
