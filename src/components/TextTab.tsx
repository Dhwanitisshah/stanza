"use client";

import type { PublicProsody } from "@/lib/prosody";
import { contrastRatio } from "@/lib/moods/contrast";
import { isHardToRead, type ResolvedPalette } from "@/lib/render/styling";
import type { TitlePlacement } from "@/lib/render/types";
import { ColourField } from "./ColourField";
import { BUTTON_SECONDARY, Eyebrow, FIELD, Segmented } from "./ui";

export function TextTab({
  titlePlacement,
  onTitlePlacement,
  hasTitle,
  byline,
  onByline,
  prosody,
  palette,
  lineColours,
  onLineColour,
  marked,
  onToggleWord,
  emphasisColour,
  onEmphasisColour,
  customEmphasis,
  onLetStanzaChoose,
  canReset,
  onReset,
}: {
  titlePlacement: TitlePlacement;
  onTitlePlacement: (placement: TitlePlacement) => void;
  hasTitle: boolean;
  byline: string;
  onByline: (value: string) => void;
  /** The poem as read; null until the first reading is in. */
  prosody: PublicProsody | null;
  /** The colours the poster really has right now (after the mood, background and photo). */
  palette: ResolvedPalette;
  lineColours: Record<number, string>;
  /** Set or clear (null) a line's colour. */
  onLineColour: (line: number, colour: string | null) => void;
  /** Ids of the important (emphasised) words right now. */
  marked: ReadonlySet<string>;
  onToggleWord: (wordId: string) => void;
  /** The colour emphasised words are drawn in right now. */
  emphasisColour: string;
  onEmphasisColour: (colour: string) => void;
  /** True if the user has changed the important words or their colour. */
  customEmphasis: boolean;
  onLetStanzaChoose: () => void;
  canReset: boolean;
  onReset: () => void;
}) {
  const lines = prosody?.stanzas.flatMap((s) => s.lines) ?? [];

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <Eyebrow>Title placement</Eyebrow>
        <Segmented<TitlePlacement>
          label="Title placement"
          value={titlePlacement}
          onChange={onTitlePlacement}
          options={[
            { value: "above", label: "Above poem" },
            { value: "footer", label: "In footer" },
            { value: "hidden", label: "Hidden" },
          ]}
        />
        {!hasTitle && <p className="text-xs text-muted">The poster shows a title only when you set or accept one.</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="byline">
          <span className="text-sm">Byline</span>
        </label>
        <input id="byline" value={byline} onChange={(event) => onByline(event.target.value)} maxLength={80} placeholder="Your name" className={`${FIELD} min-h-11 text-base`} />
        <p className="text-xs text-muted">Shown small, in the footer of the finished poster, with a dash in front.</p>
      </div>

      <section aria-labelledby="line-colours" className="flex flex-col gap-3">
        <h3 id="line-colours" className="eyebrow">
          Line colours
        </h3>
        {lines.length === 0 && <p className="text-sm text-muted">Appears once Stanza has read your poem.</p>}
        <ul className="flex flex-col gap-3">
          {lines.map((line) => {
            const colour = lineColours[line.index];
            const shown = colour ?? palette.ink;
            const hard = colour !== undefined && isHardToRead(colour, palette);
            return (
              <li key={line.index} className="flex items-start gap-3">
                <ColourField label={`Colour for line ${line.index + 1}`} value={shown} onChange={(next) => onLineColour(line.index, next)} />
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-xs text-muted">Line {line.index + 1}</p>
                  <p className="text-sm leading-snug">{line.words.map((w) => w.text).join(" ")}</p>
                  {hard && (
                    <p role="status" className="mt-1 text-xs font-medium text-accent">
                      Hard to read on this background ({contrastRatio(colour, palette.background).toFixed(1)}:1; 3:1 or more reads well).
                    </p>
                  )}
                </div>
                {colour !== undefined && (
                  <button type="button" onClick={() => onLineColour(line.index, null)} aria-label={`Use the default colour for line ${line.index + 1}`} className="inline-flex min-h-11 items-center px-1 text-xs underline underline-offset-4">
                    Default
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="important-words" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="important-words" className="eyebrow">
            Important words
          </h3>
          <button
            type="button"
            onClick={onLetStanzaChoose}
            disabled={!customEmphasis}
            className="inline-flex min-h-11 items-center text-xs font-medium text-accent underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Let Stanza choose
          </button>
        </div>
        <div role="group" aria-label="Important words" className="flex flex-wrap gap-1.5">
          {lines.flatMap((line) =>
            line.words.map((word) => {
              const on = marked.has(word.id);
              return (
                <button
                  key={word.id}
                  type="button"
                  data-word={word.id}
                  aria-pressed={on}
                  onClick={() => onToggleWord(word.id)}
                  className={`min-h-11 rounded-full border px-3 text-sm transition-colors ${on ? "border-transparent font-semibold" : "border-rule bg-field hover:bg-panel"}`}
                  style={on ? { background: emphasisColour, color: contrastRatio("#1C1A17", emphasisColour) >= contrastRatio("#F6F1E7", emphasisColour) ? "#1C1A17" : "#F6F1E7" } : undefined}
                >
                  {word.core}
                </button>
              );
            }),
          )}
        </div>
        <div className="flex items-center gap-3">
          <ColourField label="Colour for important words" value={emphasisColour} onChange={onEmphasisColour} />
          <span className="text-sm">Colour for important words</span>
        </div>
        <p className="text-xs text-muted">Tap a word to mark it. Marked words hold a beat longer and take this colour. Your marks replace Stanza&apos;s own pick.</p>
      </section>

      <button type="button" onClick={onReset} disabled={!canReset} className={`${BUTTON_SECONDARY} self-start`}>
        Reset styling
      </button>
    </div>
  );
}
