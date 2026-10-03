"use client";

import { useRef } from "react";
import type { Scene } from "@/lib/render/types";
import { layoutStats } from "@/lib/render/layoutStats";
import { usePlayer } from "./usePlayer";

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.round(ms));
  const seconds = Math.floor(total / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.${String(total % 1000).padStart(3, "0")}`;
};

/**
 * The canvas is 1080 wide internally: that IS the export resolution. CSS only scales it down to fit,
 * so a preview pixel is an export pixel. Mount with `key` so each scene gets a fresh player.
 */
export function PreviewCanvas({ scene }: { scene: Scene }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { player, state, totalMs } = usePlayer(scene, canvasRef);
  const { width, height } = scene.layout;
  const stats = layoutStats(scene.layout);
  // For the dev tools: which mood this is, and a moment worth looking at (an echo landing, mid-entrance).
  const echo = scene.timeline.events.find((e) => e.type === "echo");
  const reviewMs = Math.round(echo ? echo.start + echo.duration * 0.45 : totalMs * 0.4);

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        aria-label="Poem preview"
        data-font-size={stats.fontSize}
        data-pages={stats.pages}
        data-lines={stats.lines}
        data-wrapped-lines={stats.wrappedLines}
        data-total-ms={totalMs}
        data-mood={scene.mood.id}
        data-review-ms={reviewMs}
        className="block h-auto max-h-[70vh] w-auto max-w-full border border-black/20 shadow-sm"
      />

      <div className="flex w-full max-w-xl flex-col gap-2 text-sm">
        <input
          type="range"
          min={0}
          max={totalMs}
          step={1}
          value={Math.round(state.t)}
          onChange={(event) => player.seek(Number(event.target.value))}
          aria-label="Position in the poem, in milliseconds"
          className="w-full"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => player.toggle()} className="rounded border border-black/40 px-3 py-1">
            {state.playing ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={() => player.restart()} className="rounded border border-black/40 px-3 py-1">
            Restart
          </button>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={state.loop} onChange={(event) => player.setLoop(event.target.checked)} />
            Loop
          </label>
          <span className="ml-auto tabular-nums" aria-live="off">
            {formatTime(state.t)} / {formatTime(totalMs)}
          </span>
        </div>
        <p className="text-xs text-black/50">Space plays and pauses.</p>
      </div>
    </div>
  );
}
