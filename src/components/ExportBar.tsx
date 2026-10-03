"use client";

import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./ui";

/**
 * The export buttons, pinned under the tabs on desktop and along the bottom on phones.
 * Video and PNG export are the next phase: the buttons are in place so the layout is final, but disabled.
 */
export function ExportBar({
  format,
  onCopyLink,
  canShare,
  layout,
}: {
  format: "reel" | "post";
  onCopyLink: () => void;
  canShare: boolean;
  layout: "panel" | "bar";
}) {
  const note = "Export arrives in the next phase.";
  if (layout === "bar") {
    return (
      <div className="flex gap-3">
        <button type="button" disabled aria-describedby="export-note" className={`${BUTTON_PRIMARY} flex-1`}>
          Export {format}
        </button>
        <button type="button" onClick={onCopyLink} disabled={!canShare} className={BUTTON_SECONDARY}>
          Share
        </button>
        <span id="export-note" className="sr-only-text">
          {note}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <button type="button" disabled aria-describedby="export-note" className={`${BUTTON_PRIMARY} w-full`}>
        Download {format} · MP4
      </button>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" disabled aria-describedby="export-note" className={BUTTON_SECONDARY}>
          Poster · PNG
        </button>
        <button type="button" onClick={onCopyLink} disabled={!canShare} className={BUTTON_SECONDARY}>
          Copy link
        </button>
      </div>
      <p id="export-note" className="text-xs text-muted">
        {note} The link already works: your poem and every setting are inside it.
      </p>
    </div>
  );
}
