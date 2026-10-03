"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export type TabId = "poem" | "mood" | "text" | "background" | "timing";

const TABS: { id: TabId; label: ReactNode; ariaLabel: string; mobileOnly?: boolean }[] = [
  { id: "poem", label: "Poem", ariaLabel: "Poem", mobileOnly: true },
  { id: "mood", label: "Mood", ariaLabel: "Mood" },
  { id: "text", label: "Text", ariaLabel: "Text" },
  {
    id: "background",
    label: (
      <>
        <span className="hidden lg:inline">Background</span>
        <span className="lg:hidden">Backdrop</span>
      </>
    ),
    ariaLabel: "Background",
  },
  { id: "timing", label: "Timing", ariaLabel: "Timing" },
];

/** A tab list with real tab semantics: aria-selected, roving tabindex, and arrow keys to move between tabs. */
export function EditorTabs({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    // Skip tabs that are hidden at this screen size (the Poem tab is mobile only).
    const visible = TABS.filter((tab) => refs.current[tab.id]?.offsetParent !== null);
    const index = visible.findIndex((tab) => tab.id === active);
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? visible.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + visible.length) % visible.length;
    event.preventDefault();
    const tab = visible[next];
    if (tab) {
      onChange(tab.id);
      refs.current[tab.id]?.focus();
    }
  }

  return (
    <div role="tablist" aria-label="Editor sections" onKeyDown={onKeyDown} className="flex overflow-x-auto border-b border-rule">
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            aria-label={tab.ariaLabel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`min-h-11 flex-1 whitespace-nowrap px-3 text-sm transition-colors ${tab.mobileOnly ? "lg:hidden" : ""} ${
              selected ? "border-b-2 border-ink font-semibold" : "border-b-2 border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
