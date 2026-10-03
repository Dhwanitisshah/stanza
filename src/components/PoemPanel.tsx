"use client";

import type { AnalyzeResponse } from "@/lib/editor/analyzeClient";
import { BUTTON_PRIMARY, Eyebrow, FIELD } from "./ui";

/** One colour per rhyme letter, chosen to stay readable on the paper background. */
const LETTER_COLOURS = ["#b23a1e", "#2f5d8a", "#4f7a5a", "#7a4a8a", "#8a6a1e", "#1f6b6b"];
const letterColour = (letter: string) => (letter === "X" ? "#6b645a" : LETTER_COLOURS[(letter.charCodeAt(0) - 65) % LETTER_COLOURS.length] ?? LETTER_COLOURS[0]);

export interface ReadStats {
  source: AnalyzeResponse["source"];
  seconds: number;
}

function readLabel(stats: ReadStats | null): string | null {
  if (!stats) return null;
  if (stats.source === "gemini") return `Read by Gemini in ${stats.seconds.toFixed(1)} s`;
  if (stats.source === "skipped") return "Restored from a share link";
  return "Read by Stanza's built-in reader (Gemini wasn't available)";
}

export function PoemPanel({
  poem,
  onPoem,
  title,
  onTitle,
  suggestion,
  response,
  busy,
  error,
  stats,
  edited,
  onRead,
}: {
  poem: string;
  onPoem: (value: string) => void;
  title: string;
  onTitle: (value: string) => void;
  suggestion: string | null;
  response: AnalyzeResponse | null;
  busy: boolean;
  error: string | null;
  stats: ReadStats | null;
  edited: boolean;
  onRead: () => void;
}) {
  const prosody = response?.prosody;
  const lines = prosody?.stanzas.flatMap((s) => s.lines) ?? [];

  return (
    <div className="flex flex-col gap-5 p-5 lg:p-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="editor-title">
          <Eyebrow optional="optional">Title</Eyebrow>
        </label>
        <input
          id="editor-title"
          value={title}
          onChange={(event) => onTitle(event.target.value)}
          maxLength={120}
          placeholder="No title"
          className={`${FIELD} min-h-11 font-serif text-xl`}
        />
        {!title.trim() && suggestion && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            Suggested: <span className="font-serif text-lg italic text-ink">{suggestion}</span>
            <button
              type="button"
              onClick={() => onTitle(suggestion)}
              aria-label={`Use the suggested title ${suggestion}`}
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-ink underline underline-offset-4"
            >
              Use it
            </button>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="editor-poem">
          <Eyebrow>The poem</Eyebrow>
        </label>
        <textarea
          id="editor-poem"
          value={poem}
          onChange={(event) => onPoem(event.target.value)}
          rows={8}
          className={`${FIELD} resize-y py-3 font-serif text-xl leading-snug`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={onRead} disabled={busy} className={`${BUTTON_PRIMARY} self-start`}>
          {busy ? "Reading..." : "Read it again"}
        </button>
        {edited && !busy && <p className="text-sm text-accent">You changed the poem. Read it again to update everything.</p>}
        {error && (
          <p role="alert" className="rounded-md border border-accent/50 bg-accent/5 px-3 py-2 text-sm">
            {error}
          </p>
        )}
        {!error && <p className="text-xs text-muted">{busy ? "Listening to the poem..." : readLabel(stats)}</p>}
      </div>

      {response && (
        <>
          <section aria-labelledby="reading-heading" className="flex flex-col gap-2">
            <h2 id="reading-heading" className="eyebrow">
              Stanza&apos;s reading
            </h2>
            <p className="font-serif text-[1.65rem] italic leading-[1.15]">{response.analysis.reading}</p>
            <p className="text-sm text-muted">
              Mood <strong className="font-semibold text-ink">{response.analysis.mood}</strong> · intensity {response.analysis.intensity.toFixed(1)}
            </p>
          </section>

          <section aria-labelledby="heard-heading" className="flex flex-col gap-3">
            <h2 id="heard-heading" className="eyebrow">
              What Stanza heard
            </h2>
            <ol className="flex flex-col gap-2.5">
              {lines.map((line) => (
                <li key={line.index} className="flex items-start justify-between gap-3 text-sm leading-snug">
                  <span>{line.words.map((w) => w.text).join(" ")}</span>
                  <span
                    className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-[3px] border text-[11px] font-semibold"
                    style={{ color: letterColour(line.rhymeLetter), borderColor: letterColour(line.rhymeLetter) }}
                    title={line.rhymeLetter === "X" ? "No end rhyme" : `Rhyme ${line.rhymeLetter}`}
                  >
                    <span className="sr-only-text">{line.rhymeLetter === "X" ? "No end rhyme" : `Rhyme ${line.rhymeLetter}`}</span>
                    <span aria-hidden>{line.rhymeLetter === "X" ? "·" : line.rhymeLetter}</span>
                  </span>
                </li>
              ))}
            </ol>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-4">
              {[
                ["Scheme", prosody!.scheme.replaceAll("X", "·")],
                ["Lines", String(lines.length)],
                ["Words", String(prosody!.wordCount)],
                ["Syllables", String(prosody!.syllableCount)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-0.5 break-all text-lg">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
