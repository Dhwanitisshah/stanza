"use client";

import { useEffect, useState } from "react";
import type { Analysis } from "@/lib/ai/schema";
import { getMoodPreset } from "@/lib/moods/presets";
import type { PublicProsody } from "@/lib/prosody";
import { createCanvasMeasure, loadMoodFonts, resolveMoodFonts } from "@/lib/render/browser";
import { buildScene } from "@/lib/render/scene";
import type { FormatId, Scene } from "@/lib/render/types";

export interface SceneInput {
  prosody: PublicProsody;
  analysis: Analysis;
  format: FormatId;
  speed: number;
}

export type SceneState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  /** `key` changes whenever the scene really changed, so the player below can remount and restart. */
  | { status: "ready"; scene: Scene; key: number };

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
        const preset = resolveMoodFonts(getMoodPreset(input.analysis.mood));
        await loadMoodFonts(preset, poemText(input.prosody));
        if (cancelled) return;
        const scene = buildScene({ ...input, preset, measureText: createCanvasMeasure() });
        setResult((prev) =>
          prev?.input === input && prev.scene && sameScene(prev.scene, scene)
            ? prev
            : { input, scene, key: (prev?.key ?? 0) + 1 },
        );
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Couldn't prepare the poster.";
        setResult((prev) => ({ input, error: message, key: (prev?.key ?? 0) + 1 }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [input, fontEvents]);

  if (!input) return { status: "idle" };
  if (!result || result.input !== input) return { status: "loading" };
  if (result.error) return { status: "error", message: result.error };
  return result.scene ? { status: "ready", scene: result.scene, key: result.key } : { status: "loading" };
}
