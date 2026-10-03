"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { analyzePoem, poemProblem, type AnalyzeResult } from "@/lib/editor/analyzeClient";
import { DEFAULT_SETTINGS, effectiveAnalysis, formatByline, toShareState, type EditorSettings } from "@/lib/editor/settings";
import { shareHash } from "@/lib/share/encode";
import { BackgroundTab } from "./BackgroundTab";
import { EditorTabs, type TabId } from "./EditorTabs";
import { ExportBar } from "./ExportBar";
import { Logo } from "./Logo";
import { MoodTab } from "./MoodTab";
import { PoemPanel, type ReadStats } from "./PoemPanel";
import { PreviewPanel } from "./PreviewPanel";
import { TextTab } from "./TextTab";
import { TimingTab } from "./TimingTab";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./ui";
import { useDebounced } from "./useDebounced";
import { useScene } from "./useScene";

/** What the editor starts from: a poem, the settings, and whether the settings came from a share link. */
export interface Session {
  id: number;
  poem: string;
  settings: EditorSettings;
  /** Opened from a share link: read with skipAi, and keep the saved settings exactly. */
  fromLink: boolean;
  /** A friendly message to show at the top (e.g. "that link was damaged, here is your poem"). */
  notice?: string;
}

export const newSettings = (patch: Partial<EditorSettings> = {}): EditorSettings => ({ ...DEFAULT_SETTINGS, ...patch });

const FORMAT_LABEL = { reel: "Reel · 9:16 · 1080 × 1920", post: "Post · 4:5 · 1080 × 1350" } as const;

export function Editor({ session, onExit }: { session: Session; onExit: (goToHow: boolean) => void }) {
  const [poem, setPoem] = useState(session.poem);
  const [settings, setSettings] = useState<EditorSettings>(session.settings);
  const [result, setResult] = useState<(AnalyzeResult & { poem: string }) | null>(null);
  const [busy, setBusy] = useState(true); // the first read starts as soon as the editor opens
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("mood");
  const [toast, setToast] = useState<string | null>(null);
  const [notice, setNotice] = useState(session.notice ?? null);

  const change = useCallback((patch: Partial<EditorSettings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const applyResult = useCallback((next: AnalyzeResult, poemRead: string, resetEmphasis: boolean) => {
    setResult({ ...next, poem: poemRead });
    setBusy(false);
    setError(null);
    // A new reading brings a new emphasis pick; the user's other choices stay.
    if (resetEmphasis) setSettings((s) => ({ ...s, emphasis: null }));
  }, []);

  // The first reading. Share links skip the AI: the saved settings already say how the poster looks.
  useEffect(() => {
    let cancelled = false;
    analyzePoem(session.poem, { skipAi: session.fromLink })
      .then((next) => !cancelled && applyResult(next, session.poem, false))
      .catch((e: unknown) => {
        if (cancelled) return;
        setBusy(false);
        setError(e instanceof Error ? e.message : "Something went wrong reading that poem.");
      });
    return () => {
      cancelled = true;
    };
  }, [session, applyResult]);

  function readAgain() {
    const problem = poemProblem(poem);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    analyzePoem(poem)
      .then((next) => applyResult(next, poem, true))
      .catch((e: unknown) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : "Something went wrong reading that poem.");
      });
  }

  // Typing in the title or byline should not rebuild the poster on every key.
  const title = useDebounced(settings.title);
  const byline = useDebounced(settings.byline);

  const { format, lengthMs, titlePlacement, echoes, mood, paletteVariant, emphasis } = settings;
  const response = result;
  const input = useMemo(
    () =>
      response
        ? {
            prosody: response.prosody,
            analysis: effectiveAnalysis(response.analysis, { mood, paletteVariant, emphasis }, response.prosody),
            format,
            speed: 1,
            lengthMs,
            title: title.trim() || undefined,
            titlePlacement,
            byline: formatByline(byline),
            echoes,
          }
        : null,
    [response, format, lengthMs, title, titlePlacement, byline, echoes, mood, paletteVariant, emphasis],
  );
  const sceneState = useScene(input);
  const length = sceneState.status === "ready" ? sceneState.scene.length : null;

  // Copy link: the poem and every setting, compressed into the URL hash.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function copyLink() {
    if (!response) return;
    const state = toShareState(response.poem, settings, response.analysis, response.prosody);
    const url = `${window.location.origin}${window.location.pathname}${shareHash(state)}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast("Link copied. It holds your poem and every setting.");
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  const poemPanel = (
    <PoemPanel
      poem={poem}
      onPoem={setPoem}
      title={settings.title}
      onTitle={(value) => change({ title: value })}
      suggestion={response?.analysis.title ?? null}
      response={response}
      busy={busy}
      error={error}
      stats={response ? ({ source: response.source, seconds: response.latencyMs / 1000 } satisfies ReadStats) : null}
      edited={response !== null && poem !== response.poem}
      onRead={readAgain}
    />
  );

  const shownMood = sceneState.status === "ready" ? sceneState.scene.mood.id : (mood ?? response?.analysis.mood ?? null);

  return (
    <div className="flex min-h-screen flex-col pb-24 lg:h-screen lg:min-h-0 lg:pb-0">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-rule px-4 py-3 sm:px-6">
        <button type="button" onClick={() => onExit(false)} aria-label="Stanza, back to the start" className="inline-flex min-h-11 items-center rounded-md text-left">
          <Logo />
        </button>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <button type="button" onClick={() => onExit(true)} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
              How it reads
            </button>
          </div>
          <div className="hidden sm:block">
            <button type="button" onClick={copyLink} disabled={!response} className={BUTTON_SECONDARY}>
              Copy share link
            </button>
          </div>
          <div className="hidden sm:block">
            <button type="button" disabled className={BUTTON_PRIMARY} title="Export arrives in the next phase">
              Export
            </button>
          </div>
          <div className="sm:hidden">
            <button type="button" onClick={copyLink} disabled={!response} aria-label="Copy share link" className={`${BUTTON_PRIMARY} size-11 !px-0`}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M9 2v9m0 0L5.5 7.5M9 11l3.5-3.5M3 12.5V15h12v-2.5" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {notice && (
        <p role="status" className="flex shrink-0 items-start justify-between gap-4 border-b border-accent/30 bg-accent/5 px-4 py-3 text-sm sm:px-6">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="inline-flex min-h-11 shrink-0 items-center underline underline-offset-4">
            Dismiss
          </button>
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        <aside aria-label="Your poem and Stanza's reading" className="hidden min-w-0 overflow-y-auto border-r border-rule lg:block">
          {poemPanel}
        </aside>

        <main className="flex min-w-0 flex-col items-center gap-3 overflow-y-auto bg-panel px-4 py-6 lg:px-8">
          <p className="font-mono text-xs text-muted">
            {FORMAT_LABEL[format]}
            {shownMood ? ` · ${shownMood}` : ""}
          </p>
          {sceneState.status === "ready" ? (
            <PreviewPanel key={sceneState.key} scene={sceneState.scene} />
          ) : (
            <div className="flex min-h-[50vh] w-full items-center justify-center text-center text-sm text-muted" role="status">
              {sceneState.status === "error"
                ? sceneState.message
                : error && !response
                  ? error
                  : busy
                    ? "Listening to the poem..."
                    : "Loading fonts and laying out the poem..."}
            </div>
          )}
        </main>

        <aside aria-label="Settings" className="flex min-h-0 min-w-0 flex-col border-t border-rule bg-paper lg:border-t-0 lg:border-l">
          <EditorTabs active={tab} onChange={setTab} />
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto p-5">
            {tab === "poem" && <div className="-m-5 lg:hidden">{poemPanel}</div>}
            {tab === "mood" && (
              <MoodTab
                aiMood={response?.analysis.mood ?? null}
                mood={mood}
                paletteVariant={paletteVariant ?? response?.analysis.paletteVariant ?? 0}
                onMood={(next) => change({ mood: next })}
                onPaletteVariant={(variant) => change({ paletteVariant: variant })}
              />
            )}
            {tab === "text" && (
              <TextTab
                titlePlacement={titlePlacement}
                onTitlePlacement={(next) => change({ titlePlacement: next })}
                hasTitle={settings.title.trim() !== ""}
                byline={settings.byline}
                onByline={(value) => change({ byline: value })}
              />
            )}
            {tab === "background" && <BackgroundTab />}
            {tab === "timing" && (
              <TimingTab
                format={format}
                onFormat={(next) => change({ format: next })}
                lengthMs={lengthMs}
                onLength={(ms) => change({ lengthMs: ms })}
                length={length}
                echoes={echoes}
                onEchoes={(on) => change({ echoes: on })}
              />
            )}
          </div>
          <div className="hidden shrink-0 border-t border-rule p-5 lg:block">
            <ExportBar layout="panel" format={format} onCopyLink={copyLink} canShare={response !== null} />
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-paper p-3 lg:hidden">
        <ExportBar layout="bar" format={format} onCopyLink={copyLink} canShare={response !== null} />
      </div>

      <p role="status" aria-live="polite" className={`fixed bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-md bg-ink px-4 py-2 text-sm text-paper shadow-lg lg:bottom-6 ${toast ? "" : "hidden"}`}>
        {toast}
      </p>
    </div>
  );
}
