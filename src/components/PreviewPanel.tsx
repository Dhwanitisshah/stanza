"use client";

import { useRef } from "react";
import { layoutStats } from "@/lib/render/layoutStats";
import type { Scene } from "@/lib/render/types";
import type { ImageAsset } from "@/lib/render/image";
import { RhythmStrip } from "./RhythmStrip";
import { usePlayer } from "./usePlayer";
import { formatClock } from "./ui";

/**
 * The canvas is 1080 wide internally: that IS the export resolution. CSS only scales it down to fit,
 * so a preview pixel is an export pixel. The player lives as long as the poem: a change of style keeps the playhead.
 */
export function PreviewPanel({ scene, image = null }: { scene: Scene; image?: ImageAsset | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { player, state, totalMs } = usePlayer(scene, canvasRef, image);
  const { width, height } = scene.layout;
  const stats = layoutStats(scene.layout);

  // For the dev tools (posters, layout-stats, perf): which mood this is, and a moment worth looking at.
  const echo = scene.timeline.events.find((e) => e.type === "echo");
  const reviewMs = Math.round(echo ? echo.start + echo.duration * 0.45 : totalMs * 0.4);

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-5">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        aria-label={`Poster preview, ${scene.format === "reel" ? "reel" : "post"}`}
        data-font-size={stats.fontSize}
        data-pages={stats.pages}
        data-lines={stats.lines}
        data-wrapped-lines={stats.wrappedLines}
        data-total-ms={totalMs}
        data-mood={scene.mood.id}
        data-review-ms={reviewMs}
        className="block h-auto max-h-[40vh] w-auto max-w-full sm:max-h-[58vh] shadow-[0_24px_50px_-24px_rgba(28,26,23,0.55)] lg:max-h-[min(66vh,760px)]"
      />

      <div className="flex w-full max-w-[680px] flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => player.toggle()}
            aria-label={state.playing ? "Pause" : "Play"}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-paper hover:bg-black"
          >
            {state.playing ? (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <rect x="3" y="2" width="3.5" height="12" fill="currentColor" />
                <rect x="9.5" y="2" width="3.5" height="12" fill="currentColor" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => player.restart()}
            aria-label="Restart from the beginning"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-rule bg-field hover:bg-panel"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M3.5 9a5.5 5.5 0 1 0 1.8-4.1" />
              <path d="M3 2.5v3.2h3.2" />
            </svg>
          </button>
          <span className="font-mono text-sm tabular-nums" aria-live="off">
            {formatClock(state.t)} / {formatClock(totalMs)}
          </span>
          <button
            type="button"
            aria-pressed={state.loop}
            onClick={() => player.setLoop(!state.loop)}
            className={`ml-auto min-h-11 rounded-md border px-4 text-sm ${state.loop ? "border-ink bg-ink text-paper" : "border-rule bg-field text-ink hover:bg-panel"}`}
          >
            Loop
          </button>
        </div>

        <RhythmStrip scene={scene} t={state.t} onSeek={(ms) => player.seek(ms)} />
      </div>
    </div>
  );
}
