"use client";

import { ComingNext, Eyebrow, Segmented } from "./ui";

/** Phase 5b. Visible now so the shape of the editor is clear, but nothing here changes the poster yet. */
export function BackgroundTab() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        Backgrounds, patterns, your own colour or photo.
        <ComingNext />
      </p>
      <div className="flex flex-col gap-2 opacity-60">
        <Eyebrow>Backdrop</Eyebrow>
        <Segmented<"mood" | "colour" | "image"> label="Backdrop source" value="mood" onChange={() => {}} disabled options={[{ value: "mood", label: "Mood" }, { value: "colour", label: "Colour" }, { value: "image", label: "Image" }]} />
      </div>
      <div className="grid grid-cols-3 gap-2 opacity-60" aria-hidden>
        {["None", "Ruled", "Notebook", "Grid", "Dots", "Frame"].map((name) => (
          <div key={name} className="flex h-20 items-end rounded-md border border-rule bg-field p-1.5 text-xs text-muted">
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}
