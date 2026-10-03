// The editor's settings model and how it maps to a poster and to a share link. Pure and client-safe.
import type { Analysis } from "@/lib/ai/schema";
import type { MoodId } from "@/lib/moods/ids";
import type { PublicProsody } from "@/lib/prosody";
import type { ShareState } from "@/lib/share/encode";
import type { FormatId, TitlePlacement } from "@/lib/render/types";

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
}

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
