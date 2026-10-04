"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { canShareFile, downloadBlob, shareFile, type ShareNavigator } from "@/lib/export/deliver";
import { ExportCancelled } from "@/lib/export/encodeFrames";
import { exportReel, probeReel, type ReelMethod } from "@/lib/export/exportReel";
import { exportStill, STILL_EXTENSION, type StillType } from "@/lib/export/exportStill";
import { exportFilename } from "@/lib/export/filename";
import { EXPORT_FPS } from "@/lib/export/frameTimes";
import { supportLink } from "@/lib/export/supportLink";
import type { ImageAsset } from "@/lib/render/image";
import type { Scene } from "@/lib/render/types";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Eyebrow, FIELD, formatClock, Segmented, Switch } from "./ui";

export type ExportKind = "reel" | "poster";

/** Set at build time (NEXT_PUBLIC_*), and public on purpose. Unset or not a web address: the whole thing stays hidden. */
const SUPPORT_URL = supportLink(process.env.NEXT_PUBLIC_SUPPORT_URL);

type Phase =
  | { kind: "idle"; note?: string }
  | { kind: "working"; what: ExportKind; method: "frames" | "realtime"; done: number; total: number }
  | { kind: "done"; what: ExportKind; file: File; shareable: boolean; saved: boolean; detail: string }
  | { kind: "error"; message: string };

const seconds = (ms: number) => (ms / 1000).toFixed(1);
const megabytes = (bytes: number) => (bytes >= 100_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} kB`);

function readableError(error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  return `The export didn't finish${text ? `: ${text}` : "."} Nothing was saved. You can try again, or export the poster instead.`;
}

/**
 * The export dialog: Reel or Poster, honest about how this browser will make the video, with progress and Cancel.
 * The reel is encoded frame by frame (the same renderFrame as the preview); a browser that cannot do that records in real time.
 */
export function ExportDialog({
  scene,
  image,
  poem,
  moodLabel,
  mark,
  onMark,
  getShareUrl,
  initialKind,
  onClose,
}: {
  /** The scene exactly as the preview shows it, mark included. */
  scene: Scene;
  image: ImageAsset | null;
  poem: string;
  moodLabel: string;
  mark: boolean;
  onMark: (on: boolean) => void;
  getShareUrl: () => string;
  initialKind: ExportKind;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [kind, setKind] = useState<ExportKind>(initialKind);
  const [method, setMethod] = useState<ReelMethod | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [stillType, setStillType] = useState<StillType>("image/png");
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);

  const { width, height } = scene.layout;
  const totalMs = scene.timeline.totalMs;
  const pageCount = scene.layout.pages.length;
  const working = phase.kind === "working";
  const shareUrl = useMemo(() => getShareUrl(), [getShareUrl]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      abortRef.current?.abort(); // leaving the dialog mid-export cancels it and releases the encoder
      if (dialog?.open) dialog.close();
    };
  }, []);

  // How will this browser make the video? Found out up front so the dialog can say so before anyone waits.
  useEffect(() => {
    let cancelled = false;
    const forceRealtime = new URLSearchParams(window.location.search).get("export") === "realtime";
    probeReel(scene, forceRealtime).then((found) => !cancelled && setMethod(found));
    return () => {
      cancelled = true;
    };
  }, [scene]);

  function close() {
    abortRef.current?.abort();
    onClose();
  }

  /** A finished or failed export belongs to the options it was made with: changing them starts fresh. */
  function startOver(note?: string) {
    setPhase((prev) => (prev.kind === "done" || prev.kind === "error" ? { kind: "idle", note } : prev));
  }

  /** Cancel stops an export in progress and stays here; with nothing running it closes the dialog. */
  function cancel() {
    if (abortRef.current) abortRef.current.abort();
    else close();
  }

  const fullLink = () => `${window.location.origin}${window.location.pathname}${shareUrl}`;

  async function startReel() {
    if (!method || method.kind === "none") return;
    const controller = new AbortController();
    abortRef.current = controller;
    const how = method.kind === "frames" ? "frames" : "realtime";
    setPhase({ kind: "working", what: "reel", method: how, done: 0, total: 1 });
    try {
      const result = await exportReel({
        scene,
        image,
        method,
        signal: controller.signal,
        onProgress: (p) => {
          // Re-rendering for every one of ~450 frames is wasteful; every third is smooth enough.
          if (p.method === "realtime" || p.done % 3 === 0 || p.done === p.total) setPhase((prev) => (prev.kind === "working" ? { ...prev, done: p.done, total: p.total } : prev));
        },
      });
      const file = new File([result.blob], exportFilename({ title: scene.title, poem }, result.extension), { type: result.blob.type });
      const how2 = result.method === "frames" ? `${result.frames} frames encoded in ${seconds(result.encodeMs)} s` : `recorded in real time (${result.extension.toUpperCase()})`;
      setPhase({ kind: "done", what: "reel", file, shareable: canShareFile(navigator as ShareNavigator, file), saved: false, detail: `${file.name} · ${megabytes(file.size)} · ${how2}` });
    } catch (error) {
      setPhase(error instanceof ExportCancelled ? { kind: "idle", note: "Export cancelled. Nothing was saved." } : { kind: "error", message: readableError(error) });
    } finally {
      abortRef.current = null;
    }
  }

  async function startPoster() {
    setPhase({ kind: "working", what: "poster", method: "frames", done: 0, total: 1 });
    try {
      const blob = await exportStill(scene, image, page, stillType);
      const file = new File([blob], exportFilename({ title: scene.title, poem }, STILL_EXTENSION[stillType]), { type: blob.type });
      const shareable = canShareFile(navigator as ShareNavigator, file);
      // Where there is no share sheet, saving is the delivery: do it now, while the click is fresh.
      if (!shareable) downloadBlob(file, file.name);
      setPhase({ kind: "done", what: "poster", file, shareable, saved: !shareable, detail: `${file.name} · ${megabytes(file.size)}` });
    } catch (error) {
      setPhase({ kind: "error", message: readableError(error) });
    }
  }

  async function share(file: File) {
    try {
      await shareFile(navigator as ShareNavigator, file, scene.title ?? "My poem");
    } catch {
      downloadBlob(file, file.name); // the share sheet failed: fall back to saving it
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(fullLink());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", fullLink());
    }
  }

  // ---- what to say, and what the main button does
  const percent = phase.kind === "working" ? Math.min(100, Math.round((phase.done / Math.max(1, phase.total)) * 100)) : 0;
  const reelExtension = method?.kind === "realtime" ? method.type.container.toUpperCase() : "MP4";
  const realtimeWebm = method?.kind === "realtime" && method.type.container === "webm";
  const reelUnavailable = method?.kind === "none";

  let primary: { label: string; onClick?: () => void; disabled?: boolean } = { label: "Checking this browser…", disabled: true };
  if (phase.kind === "working") primary = { label: phase.what === "reel" ? (phase.method === "frames" ? `Encoding… ${percent}%` : `Recording… ${percent}%`) : "Making the image…", disabled: true };
  else if (phase.kind === "done") primary = phase.shareable ? { label: "Share…", onClick: () => void share(phase.file) } : { label: phase.saved ? "Download again" : "Download", onClick: () => downloadBlob(phase.file, phase.file.name) };
  else if (phase.kind === "error") primary = { label: "Try again", onClick: () => setPhase({ kind: "idle" }) };
  else if (kind === "poster") primary = { label: `Download ${stillType === "image/png" ? "PNG" : "JPEG"}`, onClick: () => void startPoster() };
  else if (method && !reelUnavailable) primary = { label: method.kind === "frames" ? "Export reel · MP4" : `Record reel · ${reelExtension}`, onClick: () => void startReel() };
  else if (reelUnavailable) primary = { label: "Not available here", disabled: true };

  const cardClass = (on: boolean) => `flex flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${on ? "border-ink bg-field" : "border-rule bg-panel/50 hover:bg-panel"}`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="export-title"
      data-phase={phase.kind}
      data-kind={kind}
      data-method={method?.kind ?? "probing"}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => event.target === dialogRef.current && close()}
      className="m-auto w-[min(680px,calc(100vw-1.5rem))] rounded-xl border border-rule bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/45"
    >
      <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-5 sm:px-7">
        <div>
          <h2 id="export-title" className="font-serif text-4xl leading-none">
            Export
          </h2>
          <p className="mt-2 text-sm text-muted">
            {scene.title ?? "Untitled"} · {moodLabel} · {seconds(totalMs)} s
          </p>
        </div>
        <button type="button" onClick={close} aria-label="Close" className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-ink/5">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </header>

      <div className="flex max-h-[calc(100dvh-14rem)] flex-col gap-5 overflow-y-auto px-5 py-5 sm:px-7">
        <div role="group" aria-label="What to export" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" aria-pressed={kind === "reel"} disabled={working} onClick={() => {
              setKind("reel");
              startOver();
            }} className={cardClass(kind === "reel")}>
            <span className="text-base font-semibold">Reel</span>
            <span className="font-mono text-xs text-muted">
              {reelExtension} · {width} × {height} · {seconds(totalMs)} s · no audio
            </span>
            <span className="text-sm text-muted">Ready for Instagram Reels. Add music in the app.</span>
          </button>
          <button type="button" aria-pressed={kind === "poster"} disabled={working} onClick={() => {
              setKind("poster");
              startOver();
            }} className={cardClass(kind === "poster")}>
            <span className="text-base font-semibold">Poster</span>
            <span className="font-mono text-xs text-muted">
              PNG or JPEG · {width} × {height}
            </span>
            <span className="text-sm text-muted">The final frame, title and byline included.</span>
          </button>
        </div>

        {kind === "poster" && phase.kind === "idle" && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-2 sm:w-48">
              <Eyebrow>Image type</Eyebrow>
              <Segmented
                label="Image type"
                value={stillType}
                onChange={(next) => {
                  setStillType(next);
                  startOver();
                }}
                options={[
                  { value: "image/png", label: "PNG" },
                  { value: "image/jpeg", label: "JPEG" },
                ]}
              />
            </div>
            {pageCount > 1 && (
              <div className="flex flex-col gap-2">
                <label htmlFor="export-page" className="eyebrow">
                  Page
                </label>
                <select id="export-page" value={page} onChange={(event) => {
                    setPage(Number(event.target.value));
                    startOver();
                  }} className={`${FIELD} min-h-11`}>
                  {scene.layout.pages.map((p) => (
                    <option key={p.index} value={p.index}>
                      Page {p.index + 1} of {pageCount}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {kind === "reel" && phase.kind === "idle" && (
          <>
            {realtimeWebm && (
              <p role="note" className="rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
                <strong>This browser can only record WebM.</strong> Instagram won&apos;t accept a WebM file. For an MP4, open Stanza in Chrome, Edge or Safari. It records in real time, so it takes {seconds(totalMs)} s and this tab must stay in front.
              </p>
            )}
            {method?.kind === "realtime" && !realtimeWebm && (
              <p role="note" className="rounded-lg border border-rule bg-panel px-4 py-3 text-sm">
                <strong>Recording in real time.</strong> This browser can&apos;t encode frame by frame, so Stanza records the poem as it plays: {seconds(totalMs)} s, and this tab must stay in front.
              </p>
            )}
            {reelUnavailable && (
              <p role="note" className="rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
                <strong>This browser can&apos;t make video.</strong> You can still export the poster, or copy the link below and open it in Chrome, Edge or Safari.
              </p>
            )}
          </>
        )}

        {phase.kind === "idle" && phase.note && (
          <p role="status" className="text-sm text-muted">
            {phase.note}
          </p>
        )}

        {phase.kind === "working" && phase.what === "reel" && (
          <section aria-label="Progress" className="rounded-lg bg-panel px-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold">{phase.method === "frames" ? "Encoding frame by frame" : "Recording in real time"}</h3>
              <span className="font-mono text-sm tabular-nums">
                {phase.method === "frames" ? `${formatClock((phase.done / EXPORT_FPS) * 1000)} / ${formatClock(totalMs)}` : `${formatClock(phase.done)} / ${formatClock(phase.total)}`}
              </span>
            </div>
            <div role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-2.5 h-2 overflow-hidden rounded-full bg-rule">
              <div className="h-full bg-ink" style={{ width: `${percent}%` }} />
            </div>
            <p role="status" aria-live="polite" className="mt-2.5 text-xs text-muted">
              {phase.method === "frames"
                ? `Encoding ${phase.done} / ${phase.total} frames. Stanza draws every frame of the poem and encodes it, so this is quicker than the poem is long.`
                : "Keep this tab in front while it records. Browsers slow animation in background tabs, which would stretch the video."}
            </p>
          </section>
        )}

        {phase.kind === "done" && (
          <section aria-label="Result" className="rounded-lg bg-panel px-4 py-4">
            <h3 className="font-serif text-2xl">{phase.what === "reel" ? "Your reel is ready" : phase.saved ? "Your poster is saved" : "Your poster is ready"}</h3>
            <p className="mt-1 break-all font-mono text-xs text-muted">{phase.detail}</p>
            {phase.shareable && <p className="mt-2 text-sm text-muted">Use Share… to send it straight to Instagram, WhatsApp or your gallery.</p>}
            {phase.shareable && (
              <button type="button" onClick={() => downloadBlob(phase.file, phase.file.name)} className="mt-2 inline-flex min-h-11 items-center text-sm underline underline-offset-4">
                Save to this device instead
              </button>
            )}
            {phase.what === "reel" && SUPPORT_URL && (
              <div className="mt-3 border-t border-rule pt-3 text-sm text-muted">
                <p>Stanza is free. If it made something you love,</p>
                <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-ink underline underline-offset-4">
                  buy me a chai ☕
                </a>
              </div>
            )}
          </section>
        )}

        {phase.kind === "error" && (
          <p role="alert" className="rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
            {phase.message}
          </p>
        )}

        <Switch label="Add “made with Stanza”" hint="A small, quiet mark in the bottom corner." checked={mark}
          onChange={(on) => {
            onMark(on);
            startOver("The mark changed, so the file you made earlier is out of date. Export again to include it.");
          }}
        />

        <div className="flex flex-col gap-2">
          <Eyebrow>Share link</Eyebrow>
          <div className="flex gap-2.5">
            <input readOnly aria-label="Share link" value={typeof window === "undefined" ? shareUrl : fullLink()} onFocus={(event) => event.currentTarget.select()} className={`${FIELD} min-h-11 min-w-0 flex-1 truncate font-mono text-xs`} />
            <button type="button" onClick={() => void copyLink()} className={BUTTON_SECONDARY}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-muted">The poem and every setting live in the link itself. Nothing is stored on a server.</p>
        </div>
      </div>

      <footer className="flex items-center justify-end gap-3 border-t border-rule px-5 py-4 sm:px-7">
        <button type="button" onClick={cancel} className={BUTTON_TEXT}>
          {phase.kind === "done" || phase.kind === "error" ? "Close" : "Cancel"}
        </button>
        <button id="export-primary" type="button" disabled={primary.disabled} onClick={primary.onClick} className={`${BUTTON_PRIMARY} min-w-44`}>
          {primary.label}
        </button>
      </footer>
    </dialog>
  );
}

const BUTTON_TEXT = "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium hover:bg-ink/5";
