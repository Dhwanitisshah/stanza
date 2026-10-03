"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { createPlayer, type Player, type PlayerState, type Scheduler } from "@/lib/render/player";
import { prepareResources } from "@/lib/render/browser";
import { renderFrame } from "@/lib/render/renderFrame";
import type { Scene } from "@/lib/render/types";

const rafScheduler: Scheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Space should toggle playback, except where it means something else (typing, pressing a button). */
function spaceIsFree(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  if (target.isContentEditable) return false;
  if (target instanceof HTMLInputElement) return target.type === "range";
  return !["TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName);
}

const FRAME_LOG_EVERY = 120;

/**
 * Drives the canvas with a requestAnimationFrame loop. One player per scene: remount (change `key`) for a new scene.
 * - draws only when t changes (the player guarantees it)
 * - pauses when the tab is hidden; Space toggles play
 * - prefers-reduced-motion: shows the finished poster and plays only when the user presses play
 */
export function usePlayer(scene: Scene, canvasRef: RefObject<HTMLCanvasElement | null>): { player: Player; state: PlayerState; totalMs: number } {
  const totalMs = scene.timeline.totalMs;
  const [reducedMotion] = useState(prefersReducedMotion);
  const [player] = useState(() =>
    createPlayer({ totalMs, scheduler: rafScheduler, initialT: reducedMotion ? totalMs : 0 }),
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const resources = prepareResources(scene);
    let frames = 0;
    let spent = 0;
    player.setDraw((t) => {
      const started = performance.now();
      renderFrame(context, scene, t, resources);
      if (process.env.NODE_ENV === "development") {
        spent += performance.now() - started;
        if (++frames % FRAME_LOG_EVERY === 0) {
          console.debug(`[stanza] average frame time ${(spent / FRAME_LOG_EVERY).toFixed(2)} ms over ${FRAME_LOG_EVERY} frames`);
          spent = 0;
        }
      }
    });

    player.redraw();
    if (!reducedMotion) player.play();

    const onVisibility = () => {
      if (document.hidden) player.pause();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!spaceIsFree(event.target)) return;
      event.preventDefault();
      player.toggle();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keydown", onKeyDown);
      player.pause();
      player.setDraw(() => {});
    };
  }, [scene, canvasRef, player, reducedMotion]);

  const state = useSyncExternalStore(player.subscribe, player.getState, player.getState);
  return { player, state, totalMs };
}
