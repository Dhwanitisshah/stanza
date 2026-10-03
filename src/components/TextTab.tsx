"use client";

import type { TitlePlacement } from "@/lib/render/types";
import { ComingNext, Eyebrow, FIELD, Segmented } from "./ui";

export function TextTab({
  titlePlacement,
  onTitlePlacement,
  hasTitle,
  byline,
  onByline,
}: {
  titlePlacement: TitlePlacement;
  onTitlePlacement: (placement: TitlePlacement) => void;
  hasTitle: boolean;
  byline: string;
  onByline: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
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
        <input
          id="byline"
          value={byline}
          onChange={(event) => onByline(event.target.value)}
          maxLength={80}
          placeholder="Your name"
          className={`${FIELD} min-h-11 text-base`}
        />
        <p className="text-xs text-muted">Shown small, in the footer of the finished poster, with a dash in front.</p>
      </div>

      <section aria-labelledby="line-colours" className="flex flex-col gap-2 opacity-60">
        <h3 id="line-colours" className="eyebrow">
          Line colours
          <ComingNext />
        </h3>
        <p className="text-sm text-muted">Give any line its own colour.</p>
      </section>

      <section aria-labelledby="important-words" className="flex flex-col gap-2 opacity-60">
        <h3 id="important-words" className="eyebrow">
          Important words
          <ComingNext />
        </h3>
        <p className="text-sm text-muted">Tap a word to mark it. Marked words hold a beat longer and take their own colour.</p>
      </section>
    </div>
  );
}
