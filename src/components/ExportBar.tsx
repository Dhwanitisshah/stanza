"use client";

import type { ExportKind } from "./ExportDialog";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./ui";

/** The export buttons, pinned under the tabs on desktop and along the bottom on phones. Both open the export dialog. */
export function ExportBar({
  format,
  onCopyLink,
  canShare,
  onExport,
  canExport,
  layout,
}: {
  format: "reel" | "post";
  onCopyLink: () => void;
  canShare: boolean;
  onExport: (kind: ExportKind) => void;
  canExport: boolean;
  layout: "panel" | "bar";
}) {
  if (layout === "bar") {
    return (
      <div className="flex gap-3">
        <button type="button" onClick={() => onExport("reel")} disabled={!canExport} className={`${BUTTON_PRIMARY} flex-1`}>
          Export {format}
        </button>
        <button type="button" onClick={onCopyLink} disabled={!canShare} className={BUTTON_SECONDARY}>
          Share
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <button type="button" onClick={() => onExport("reel")} disabled={!canExport} className={`${BUTTON_PRIMARY} w-full`}>
        Download {format} · MP4
      </button>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => onExport("poster")} disabled={!canExport} className={BUTTON_SECONDARY}>
          Poster · PNG
        </button>
        <button type="button" onClick={onCopyLink} disabled={!canShare} className={BUTTON_SECONDARY}>
          Copy link
        </button>
      </div>
      <p className="text-xs text-muted">The link holds your poem and every setting, so anyone can open the same poster.</p>
    </div>
  );
}
