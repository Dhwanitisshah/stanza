"use client";

import type { FormatId } from "@/lib/render/types";
import { LENGTH_PRESETS, lengthLabel } from "@/lib/editor/settings";
import type { LengthSolution } from "@/lib/timeline/speedForDuration";
import { Eyebrow, Segmented, Switch } from "./ui";

const seconds = (ms: number) => (ms / 1000).toFixed(1);
const CUSTOM_MAX_S = 90;

/** What the current length setting actually did, in a sentence. */
function describe(length: LengthSolution): string {
  switch (length.mode) {
    case "auto":
      return `Natural pace, ${seconds(length.totalMs)} s.`;
    case "speed":
      return `Paced at ${length.speed.toFixed(2)}× to land on ${seconds(length.totalMs)} s.`;
    case "hold":
      return `Slowest readable pace (${length.speed.toFixed(1)}×). The finished poster holds ${seconds(length.extraHoldMs)} s longer to reach ${seconds(length.totalMs)} s.`;
    case "too-short":
      return `That is shorter than this poem can be read. Showing the shortest readable length, ${seconds(length.minMs)} s, instead of rushing it.`;
  }
}

export function TimingTab({
  format,
  onFormat,
  lengthMs,
  onLength,
  length,
  echoes,
  onEchoes,
}: {
  format: FormatId;
  onFormat: (format: FormatId) => void;
  lengthMs: number | null;
  onLength: (ms: number | null) => void;
  /** The solution for the poem on screen, or null while it is still loading. */
  length: LengthSolution | null;
  echoes: boolean;
  onEchoes: (on: boolean) => void;
}) {
  const minSeconds = length ? Math.ceil(length.minMs / 1000) : 3;
  const sliderValue = Math.min(CUSTOM_MAX_S, Math.max(minSeconds, Math.round((lengthMs ?? length?.totalMs ?? 15000) / 1000)));
  const isCustom = lengthMs !== null && !LENGTH_PRESETS.includes(lengthMs);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <Eyebrow>Format</Eyebrow>
        <Segmented<FormatId>
          label="Format"
          value={format}
          onChange={onFormat}
          options={[
            { value: "reel", label: "Reel", hint: "9:16 · 1080 × 1920" },
            { value: "post", label: "Post", hint: "4:5 · 1080 × 1350" },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Eyebrow>Length</Eyebrow>
        <div role="group" aria-label="Length" className="grid grid-cols-5 gap-1.5">
          {LENGTH_PRESETS.map((preset) => {
            const unavailable = preset !== null && length !== null && preset < length.minMs;
            const on = preset === lengthMs;
            return (
              <button
                key={lengthLabel(preset)}
                type="button"
                aria-pressed={on}
                disabled={unavailable || length === null}
                onClick={() => onLength(preset)}
                title={unavailable ? `Shorter than this poem can be read. The minimum is ${seconds(length.minMs)} s.` : undefined}
                className={`min-h-11 rounded-md border px-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-ink bg-ink font-semibold text-paper" : "border-rule bg-field hover:bg-panel"}`}
              >
                {lengthLabel(preset)}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-col gap-1">
          <label htmlFor="length-custom" className="flex items-baseline justify-between text-sm">
            <span>Custom</span>
            <span className="font-mono tabular-nums">{isCustom || lengthMs !== null ? `${sliderValue} s` : "Auto"}</span>
          </label>
          <input
            id="length-custom"
            type="range"
            min={minSeconds}
            max={CUSTOM_MAX_S}
            step={1}
            value={sliderValue}
            disabled={length === null}
            aria-valuetext={`${sliderValue} seconds`}
            onChange={(event) => onLength(Number(event.target.value) * 1000)}
            className="h-11 w-full accent-[var(--accent)]"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>{minSeconds} s</span>
            <span>{CUSTOM_MAX_S} s</span>
          </div>
        </div>

        {length && (
          <p role="status" className="rounded-md bg-panel px-3 py-2 text-sm leading-5">
            {describe(length)}
          </p>
        )}
        {length && (
          <p className="text-xs text-muted">
            Shortest readable length for this poem: {seconds(length.minMs)} s. Lengths below that are switched off; longer ones keep the slowest readable pace and hold the finished poster.
          </p>
        )}
      </div>

      <Switch label="Rhyme echoes" hint="When a rhyme lands, its partner lights up." checked={echoes} onChange={onEchoes} />
    </div>
  );
}
