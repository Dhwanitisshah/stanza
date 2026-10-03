"use client";

import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { barIndexAtTime, edgeTime, rhythmBars, seekTimeForFraction, stepWord } from "@/lib/render/rhythm";
import type { Scene } from "@/lib/render/types";
import { formatClock } from "./ui";

const STRIP_HEIGHT = 60;

/**
 * One bar per word, drawn from the timeline: height is stress, the accent colour is emphasis, gaps are the poem's
 * rests, and the red line is the playhead. It is a slider: click or drag to jump to a word, or use the arrow keys
 * to step word by word (Home and End go to the first and last word).
 */
export function RhythmStrip({ scene, t, onSeek }: { scene: Scene; t: number; onSeek: (ms: number) => void }) {
  const bars = useMemo(() => rhythmBars(scene), [scene]);
  const totalMs = scene.timeline.totalMs;
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const current = barIndexAtTime(bars, t);
  const words = bars.length;
  const wordText = useMemo(() => {
    const byId = new Map<string, string>();
    for (const stanza of scene.prosody.stanzas) for (const line of stanza.lines) for (const word of line.words) byId.set(word.id, word.core);
    return byId;
  }, [scene]);

  function seekFromPointer(event: PointerEvent<HTMLDivElement>) {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const target = seekTimeForFraction(bars, (event.clientX - box.left) / box.width);
    if (target !== null) onSeek(target);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let target: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") target = stepWord(bars, t, 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") target = stepWord(bars, t, -1);
    else if (event.key === "Home") target = edgeTime(bars, "start");
    else if (event.key === "End") target = edgeTime(bars, "end");
    else return;
    event.preventDefault();
    if (target !== null) onSeek(target);
  }

  const valueText =
    current < 0
      ? `Before the first word, ${formatClock(t)}`
      : `Word ${current + 1} of ${words}, "${wordText.get(bars[current].wordId) ?? ""}", ${formatClock(t)}`;

  return (
    <div className="w-full">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Rhythm strip. Each bar is a word. Use the arrow keys to move word by word."
        aria-valuemin={0}
        aria-valuemax={totalMs}
        aria-valuenow={Math.round(t)}
        aria-valuetext={valueText}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromPointer(event);
        }}
        onPointerMove={(event) => dragging.current && seekFromPointer(event)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        className="relative w-full cursor-pointer touch-none select-none border-b border-rule"
        style={{ height: STRIP_HEIGHT }}
      >
        {bars.map((bar, i) => {
          const played = i <= current;
          const colour = bar.emphasis ? "bg-accent" : bar.level === "unstressed" ? "bg-[#c9bfae]" : "bg-ink";
          return (
            <span
              key={bar.wordId}
              aria-hidden
              className={`absolute bottom-0 rounded-[1px] ${colour} ${played ? "opacity-100" : "opacity-45"}`}
              style={{ left: `${bar.x * 100}%`, width: `calc(${bar.width * 100}% - 1.5px)`, minWidth: 2, height: `${bar.height * 100}%` }}
            />
          );
        })}
        <span aria-hidden className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent" style={{ left: `${Math.min(100, (t / totalMs) * 100)}%` }} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <i aria-hidden className="inline-block h-3 w-3 bg-ink" /> stressed
        </span>
        <span className="flex items-center gap-1.5">
          <i aria-hidden className="inline-block h-3 w-3 bg-[#c9bfae]" /> unstressed
        </span>
        <span className="flex items-center gap-1.5">
          <i aria-hidden className="inline-block h-3 w-3 bg-accent" /> emphasis
        </span>
        <span>gaps are rests</span>
        <span className="ml-auto hidden sm:inline">Each bar is a word. Click one to jump there.</span>
      </div>
    </div>
  );
}
