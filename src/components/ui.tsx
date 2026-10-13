"use client";

// Small building blocks shared by the landing page and the editor. Every control is a real <button> or <input>
// with a visible label, a 44px touch target, and the accent focus ring from globals.css.
import Link from "next/link";
import type { ReactNode } from "react";

// The class strings live in styles.ts (a plain module) so server components can use them too.
export { BUTTON_BASE, BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD } from "./styles";

export function Eyebrow({ children, optional }: { children: ReactNode; optional?: string }) {
  return (
    <span className="eyebrow">
      {children}
      {optional && <span className="ml-1.5 font-normal normal-case tracking-normal text-muted">({optional})</span>}
    </span>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Extra detail shown under the label, in a smaller size. */
  hint?: string;
}

/** A group of toggle buttons where exactly one is on. Each button reports its state with aria-pressed. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  className = "",
}: {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`flex overflow-hidden rounded-md border border-ink/70 ${className}`}>
      {options.map((option, i) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`min-h-11 flex-1 whitespace-nowrap px-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${i > 0 ? "border-l border-ink/30" : ""} ${
              on ? "bg-ink font-semibold text-paper" : "bg-field text-ink hover:bg-panel"
            }`}
          >
            {option.label}
            {option.hint && <span className={`block text-[11px] font-normal ${on ? "text-paper/70" : "text-muted"}`}>{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** An on/off switch with a label. */
export function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-sm">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="inline-flex min-h-11 min-w-12 shrink-0 items-center justify-center"
      >
        <span aria-hidden className={`relative block h-7 w-12 rounded-full border transition-colors ${checked ? "border-ink bg-ink" : "border-rule bg-field"}`}>
          <span className={`absolute top-0.5 block h-5.5 w-5.5 rounded-full transition-all ${checked ? "left-[1.375rem] bg-paper" : "left-0.5 bg-muted"}`} />
        </span>
      </button>
    </div>
  );
}

/**
 * "Read with AI": the one switch that decides whether a poem may leave this server for Google Gemini. Same words on the
 * landing page and in the editor, with a link to the privacy page (new tab, so an unsaved poem is not lost).
 */
export function ReadWithAiSwitch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <Switch
      label="Read with AI (Google Gemini)"
      checked={checked}
      onChange={onChange}
      hint={
        <>
          {checked ? "Your poem is sent to Google Gemini to pick the mood." : "Your poem is not sent to Google. Stanza's built-in reader picks the mood."}{" "}
          <Link href="/privacy" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center underline underline-offset-4">
            What happens to my poem?
          </Link>
        </>
      }
    />
  );
}

/** Marks a part of the UI that is not built yet, visibly and for screen readers. */
export function ComingNext({ children }: { children?: ReactNode }) {
  return (
    <span className="ml-2 rounded-full border border-rule bg-panel px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-muted">
      {children ?? "Coming next"}
    </span>
  );
}

export const formatClock = (ms: number) => {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const seconds = Math.floor(tenths / 10);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.${tenths % 10}`;
};
