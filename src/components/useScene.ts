"use client";

import { useEffect, useState } from "react";
import { getMoodPreset } from "@/lib/moods/presets";
import type { PublicProsody } from "@/lib/prosody";
import { createCanvasMeasure, loadMoodFonts, resolveMoodFonts } from "@/lib/render/browser";
import { buildScene, type SceneInput as BuildSceneInput } from "@/lib/render/scene";
import type { Scene } from "@/lib/render/types";

/** Everything buildScene needs except what the browser supplies (the preset with resolved fonts, and measureText). */
export type SceneInput = Omit<BuildSceneInput, "measureText" | "preset">;

export type SceneState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  /**
   * `key` changes only when it is a NEW poem (different reading), never for a change of style. While a style change
   * is still being prepared (fonts loading) the previous scene stays on screen: `refreshing` is true.
   */
  | { status: "ready"; scene: Scene; key: number; refreshing: boolean };

interface Result {
  input: SceneInput;
  key: number;
  scene?: Scene;
  error?: string;
}

const poemText = (prosody: PublicProsody) =>
  prosody.stanzas.flatMap((s) => s.lines.flatMap((l) => l.words.map((w) => w.text))).join(" ");

/** Same layout and timing: a late font event that changes nothing should not restart playback. */
const sameScene = (a: Scene, b: Scene) =>
  a.timeline.totalMs === b.timeline.totalMs && JSON.stringify(a.layout) === JSON.stringify(b.layout);

/**
 * Builds the scene in the browser: waits for the mood's fonts, measures text with them, and lays out again
 * if a font finishes loading late. It never lays out with a fallback font.
 */
export function useScene(input: SceneInput | null): SceneState {
  const [result, setResult] = useState<Result | null>(null);
  const [fontEvents, setFontEvents] = useState(0);

  useEffect(() => {
    const onLoaded = () => setFontEvents((n) => n + 1);
    document.fonts.addEventListener("loadingdone", onLoaded);
    return () => document.fonts.removeEventListener("loadingdone", onLoaded);
  }, []);

  useEffect(() => {
    if (!input) return;
    let cancelled = false;

    (async () => {
      try {
        const preset = resolveMoodFonts(getMoodPreset(input.mood ?? input.analysis.mood));
        await loadMoodFonts(preset, poemText(input.prosody));
        if (cancelled) return;
        const scene = buildScene({ ...input, preset, measureText: createCanvasMeasure() });
        setResult((prev) => {
          if (prev?.input === input && prev.scene && sameScene(prev.scene, scene)) return prev;
          const newPoem = !prev || prev.input.prosody !== input.prosody;
          return { input, scene, key: (prev?.key ?? 0) + (newPoem ? 1 : 0) };
        });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Couldn't prepare the poster.";
        setResult((prev) => ({ input, error: message, key: prev?.key ?? 0 }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [input, fontEvents]);

  if (!input) return { status: "idle" };
  if (result?.error && result.input === input) return { status: "error", message: result.error };
  if (result?.scene) return { status: "ready", scene: result.scene, key: result.key, refreshing: result.input !== input };
  return { status: "loading" };
}
