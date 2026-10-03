"use client";

import { MOOD_IDS, type MoodId } from "@/lib/moods/ids";
import { MOOD_PRESETS } from "@/lib/moods/presets";
import { Eyebrow } from "./ui";

const entranceLabel: Record<string, string> = {
  "fade-rise": "fade-rise",
  drift: "drift",
  slam: "slam",
  "ink-bleed": "ink-bleed",
  typewriter: "typewriter",
};

export function MoodTab({
  aiMood,
  mood,
  paletteVariant,
  onMood,
  onPaletteVariant,
}: {
  /** What Stanza's reading picked. null while still reading. */
  aiMood: MoodId | null;
  mood: MoodId | null;
  paletteVariant: number | null;
  onMood: (mood: MoodId) => void;
  onPaletteVariant: (variant: number) => void;
}) {
  const active = mood ?? aiMood;
  const activePreset = active ? MOOD_PRESETS[active] : null;

  return (
    <div className="flex flex-col gap-6">
      <div role="group" aria-label="Mood" className="grid grid-cols-2 gap-3">
        {MOOD_IDS.map((id) => {
          const preset = MOOD_PRESETS[id];
          const palette = preset.palettes[paletteVariant ?? 0];
          const on = id === active;
          return (
            <button
              key={id}
              type="button"
              data-mood={id}
              aria-pressed={on}
              onClick={() => onMood(id)}
              className={`flex min-h-[7.5rem] flex-col gap-2 rounded-md border p-2.5 text-left transition-colors ${on ? "border-ink bg-field ring-1 ring-ink" : "border-rule bg-field hover:border-ink/40"}`}
            >
              <span
                aria-hidden
                className="flex h-14 items-center justify-center rounded-[3px] text-[2rem] leading-none"
                style={{
                  background: palette.background,
                  color: palette.ink,
                  fontFamily: preset.typography.display,
                  fontWeight: preset.typography.weight,
                  fontStyle: preset.typography.italic ? "italic" : "normal",
                }}
              >
                A<span style={{ color: palette.accent }}>a</span>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{id}</span>
                <span className="text-[11px] leading-tight text-muted">
                  {entranceLabel[preset.entrance]} · {preset.beatMs} ms
                </span>
                {id === aiMood && <span className="mt-0.5 text-[11px] font-semibold text-accent">Stanza&apos;s read</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <Eyebrow>Palette</Eyebrow>
        <div role="group" aria-label="Palette variant" className="flex gap-3">
          {[0, 1, 2].map((variant) => {
            const palette = activePreset?.palettes[variant];
            const on = (paletteVariant ?? 0) === variant;
            return (
              <button
                key={variant}
                type="button"
                aria-pressed={on}
                aria-label={`Palette ${variant + 1}`}
                disabled={!palette}
                onClick={() => onPaletteVariant(variant)}
                className={`flex size-11 items-center justify-center rounded-full border-2 ${on ? "border-ink" : "border-rule"} disabled:opacity-45`}
              >
                <span aria-hidden className="relative size-7 overflow-hidden rounded-full border border-ink/20" style={{ background: palette?.background ?? "transparent" }}>
                  <span className="absolute bottom-0 right-0 size-3.5 rounded-tl-full" style={{ background: palette?.accent ?? "transparent" }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
