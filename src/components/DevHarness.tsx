"use client";

// TEMP: a bare-bones harness to look at the renderer. Phase 5 replaces this with the real editor.
import { useMemo, useState } from "react";
import type { Analysis, AnalysisSource } from "@/lib/ai/schema";
import { MOOD_IDS, type MoodId } from "@/lib/moods/ids";
import type { PublicProsody } from "@/lib/prosody";
import type { FormatId } from "@/lib/render/types";
import { PreviewCanvas } from "./PreviewCanvas";
import { useScene } from "./useScene";

const SAMPLE = [
  "The lamp burns low beside the door,",
  "the kettle hums a quiet tune,",
  "the rain has found the wooden floor,",
  "and somewhere far, a patient moon.",
].join("\n");

interface AnalyzeResponse {
  prosody: PublicProsody;
  analysis: Analysis;
  source: AnalysisSource;
}

async function analyze(poem: string): Promise<AnalyzeResponse> {
  let response: Response;
  try {
    response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ poem }),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection.");
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error?.message ?? `The server answered ${response.status}.`);
  return json as AnalyzeResponse;
}

export function DevHarness() {
  const [poem, setPoem] = useState(SAMPLE);
  const [format, setFormat] = useState<FormatId>("reel");
  const [mood, setMood] = useState<MoodId | "auto">("auto");
  const [byline, setByline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const input = useMemo(
    () =>
      result
        ? {
            prosody: result.prosody,
            analysis: result.analysis,
            format,
            speed: 1,
            mood: mood === "auto" ? undefined : mood,
            byline: byline.trim() || undefined,
          }
        : null,
    [result, format, mood, byline],
  );
  const sceneState = useScene(input);

  async function onAnalyze() {
    setBusy(true);
    setError(null);
    try {
      setResult(await analyze(poem));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <p className="rounded bg-yellow-200 px-3 py-1 text-sm font-semibold text-black">
        TEMP: development harness. Phase 5 replaces this page with the real editor.
      </p>
      <h1 className="text-2xl font-semibold">Stanza</h1>

      <textarea
        value={poem}
        onChange={(event) => setPoem(event.target.value)}
        rows={8}
        aria-label="Poem"
        className="w-full rounded border border-black/30 p-2 font-mono text-sm"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onAnalyze} disabled={busy} className="rounded bg-black px-4 py-1.5 text-white disabled:opacity-50">
          {busy ? "Analyzing..." : "Analyze"}
        </button>
        <label className="flex items-center gap-1 text-sm">
          Mood
          <select
            aria-label="Mood"
            value={mood}
            onChange={(event) => setMood(event.target.value as MoodId | "auto")}
            className="rounded border border-black/30 px-1 py-0.5"
          >
            <option value="auto">Auto (from analysis)</option>
            {MOOD_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm">
          Byline
          <input
            aria-label="Byline"
            value={byline}
            onChange={(event) => setByline(event.target.value)}
            placeholder="— your name"
            className="w-36 rounded border border-black/30 px-1 py-0.5"
          />
        </label>
        <fieldset className="flex items-center gap-3 text-sm">
          <legend className="sr-only">Format</legend>
          {(["reel", "post"] as const).map((id) => (
            <label key={id} className="flex items-center gap-1">
              <input type="radio" name="format" value={id} checked={format === id} onChange={() => setFormat(id)} />
              {id === "reel" ? "Reel 9:16" : "Post 4:5"}
            </label>
          ))}
        </fieldset>
      </div>

      {error && (
        <p role="alert" className="rounded border border-red-600 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {result && (
        <p className="text-sm text-black/70">
          {result.analysis.mood} ({result.source}): {result.analysis.reading}
        </p>
      )}

      {sceneState.status === "loading" && <p className="text-sm">Loading fonts and laying out the poem...</p>}
      {sceneState.status === "error" && (
        <p role="alert" className="rounded border border-red-600 px-3 py-2 text-sm text-red-700">
          {sceneState.message}
        </p>
      )}
      {sceneState.status === "ready" && <PreviewCanvas key={sceneState.key} scene={sceneState.scene} />}
    </main>
  );
}
