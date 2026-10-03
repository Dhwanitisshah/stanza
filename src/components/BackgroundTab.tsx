"use client";

import { useRef, useState } from "react";
import type { BackgroundChoice } from "@/lib/editor/settings";
import { DEFAULT_DARKEN } from "@/lib/editor/settings";
import type { ImageAsset } from "@/lib/render/image";
import { PATTERN_IDS, PATTERN_LABELS, type PatternId } from "@/lib/render/patterns";
import { COLOUR_SWATCHES, MAX_DARKEN } from "@/lib/render/styling";
import { ColourField } from "./ColourField";
import { PatternThumb } from "./PatternThumb";
import { BUTTON_SECONDARY, Eyebrow, Segmented } from "./ui";

type Source = "mood" | "colour" | "image";

export function BackgroundTab({
  background,
  onBackground,
  image,
  imageError,
  imageBusy,
  onImageFile,
  onRemoveImage,
  pattern,
  patternStrength,
  onPattern,
  onPatternStrength,
  paper,
  ink,
  canReset,
  onReset,
}: {
  background: BackgroundChoice;
  onBackground: (background: BackgroundChoice) => void;
  image: ImageAsset | null;
  imageError: string | null;
  imageBusy: boolean;
  onImageFile: (file: File) => void;
  onRemoveImage: () => void;
  pattern: PatternId;
  patternStrength: number;
  onPattern: (id: PatternId) => void;
  onPatternStrength: (strength: number) => void;
  /** The colours the poster really has right now, for the pattern previews. */
  paper: string;
  ink: string;
  canReset: boolean;
  onReset: () => void;
}) {
  // Choosing "Image" before there is one only opens the chooser; the poster changes once a photo has loaded.
  const [wantsImage, setWantsImage] = useState(false);
  const source: Source = wantsImage && !image ? "image" : background.kind;
  const fileInput = useRef<HTMLInputElement>(null);
  const lastColour = background.kind === "colour" ? background.colour : COLOUR_SWATCHES[0].colour;
  const darken = background.kind === "image" ? background.darken : DEFAULT_DARKEN;

  function choose(next: Source) {
    setWantsImage(next === "image");
    if (next === "mood") onBackground({ kind: "mood" });
    else if (next === "colour") onBackground({ kind: "colour", colour: lastColour });
    else if (image) onBackground({ kind: "image", darken });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Background</Eyebrow>
        <Segmented<Source>
          label="Background source"
          value={source}
          onChange={choose}
          options={[
            { value: "mood", label: "Mood" },
            { value: "colour", label: "Colour" },
            { value: "image", label: "Image" },
          ]}
        />
      </div>

      {source === "mood" && <p className="text-sm text-muted">The mood&apos;s own paper.</p>}

      {source === "colour" && background.kind === "colour" && (
        <div className="flex flex-col gap-3">
          <div role="group" aria-label="Background colour" className="flex flex-wrap items-center gap-2">
            {COLOUR_SWATCHES.map((swatch) => {
              const on = background.colour.toLowerCase() === swatch.colour.toLowerCase();
              return (
                <button
                  key={swatch.colour}
                  type="button"
                  aria-pressed={on}
                  aria-label={swatch.name}
                  title={swatch.name}
                  onClick={() => onBackground({ kind: "colour", colour: swatch.colour })}
                  className={`size-11 rounded-full border-2 ${on ? "border-ink" : "border-rule"}`}
                  style={{ background: swatch.colour }}
                />
              );
            })}
            <ColourField label="Pick another colour" value={background.colour} onChange={(colour) => onBackground({ kind: "colour", colour })} />
          </div>
          <p className="text-xs text-muted">The text switches between light and dark by itself so it stays readable.</p>
        </div>
      )}

      {source === "image" && (
        <div className="flex flex-col gap-3">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            aria-label="Choose a background image"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = ""; // so choosing the same file again still fires
              if (file) onImageFile(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={BUTTON_SECONDARY} disabled={imageBusy} onClick={() => fileInput.current?.click()}>
              {imageBusy ? "Opening..." : image ? "Choose a different image" : "Choose an image"}
            </button>
            {image && (
              <button type="button" onClick={onRemoveImage} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
                Remove
              </button>
            )}
          </div>
          {image && (
            <p className="text-sm">
              <span className="font-medium">{image.name}</span> <span className="text-muted">({image.width} × {image.height})</span>
            </p>
          )}
          {imageError && (
            <p role="alert" className="rounded-md border border-accent/50 bg-accent/5 px-3 py-2 text-sm">
              {imageError}
            </p>
          )}
          {image && background.kind === "image" && (
            <div className="flex flex-col gap-1">
              <label htmlFor="darken" className="flex items-baseline justify-between text-sm">
                <span>Darken</span>
                <span className="font-mono tabular-nums">{Math.round(background.darken * 100)}%</span>
              </label>
              <input
                id="darken"
                type="range"
                min={0}
                max={Math.round(MAX_DARKEN * 100)}
                step={1}
                value={Math.round(background.darken * 100)}
                aria-valuetext={`${Math.round(background.darken * 100)} percent`}
                onChange={(event) => onBackground({ kind: "image", darken: Number(event.target.value) / 100 })}
                className="h-11 w-full accent-[var(--accent)]"
              />
            </div>
          )}
          <p className="text-xs text-muted">Your image stays in this browser. It is never uploaded, and it is not part of share links.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Eyebrow>Pattern</Eyebrow>
        <div role="group" aria-label="Pattern" className="grid grid-cols-4 gap-2">
          {PATTERN_IDS.map((id) => (
            <button
              key={id}
              type="button"
              data-pattern={id}
              aria-pressed={id === pattern}
              onClick={() => onPattern(id)}
              className={`flex min-h-11 flex-col items-center gap-1.5 rounded-md border p-1.5 text-xs ${id === pattern ? "border-ink bg-field ring-1 ring-ink" : "border-rule bg-field hover:border-ink/40"}`}
            >
              {id === "none" ? <span aria-hidden className="flex h-24 w-[54px] items-center justify-center rounded-[3px] border border-dashed border-rule text-muted">·</span> : <PatternThumb id={id} ink={ink} paper={paper} />}
              {PATTERN_LABELS[id]}
            </button>
          ))}
        </div>
        <div className="mt-1 flex flex-col gap-1">
          <label htmlFor="pattern-strength" className="flex items-baseline justify-between text-sm">
            <span>Strength</span>
            <span className="font-mono tabular-nums">{pattern === "none" ? "off" : patternStrength}</span>
          </label>
          <input
            id="pattern-strength"
            type="range"
            min={0}
            max={100}
            step={1}
            value={patternStrength}
            disabled={pattern === "none"}
            aria-valuetext={`${patternStrength} out of 100`}
            onChange={(event) => onPatternStrength(Number(event.target.value))}
            className="h-11 w-full accent-[var(--accent)] disabled:opacity-40"
          />
        </div>
        <p className="text-xs text-muted">Drawn in the poster&apos;s own ink colour, behind the words.</p>
      </div>

      <button type="button" onClick={onReset} disabled={!canReset} className={`${BUTTON_SECONDARY} self-start`}>
        Reset styling
      </button>
    </div>
  );
}
