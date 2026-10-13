"use client";

import { Logo } from "@/components/Logo";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/components/ui";

// Catches a crash anywhere inside a page. "Start again" is a plain link, not a client-side navigation: a full load is
// the one thing that always clears whatever state broke. It deliberately shows no error text (which could echo a poem).
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-rule px-5 py-4 sm:px-8">
        <Logo compact />
      </header>
      <main className="mx-auto w-full max-w-[44rem] flex-1 px-5 py-16 sm:px-8">
        <p className="eyebrow !text-accent">Something broke</p>
        <h1 className="mt-4 font-serif text-[clamp(2.5rem,7vw,3.75rem)] leading-[1] tracking-tight">
          That line <em className="italic">didn&apos;t land.</em>
        </h1>
        <p className="mt-6 text-lg leading-8 text-ink/90">
          Something went wrong on our side. You can start again, and any share link you copied earlier still works.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load on purpose */}
          <a href="/" className={`${BUTTON_PRIMARY} px-6`}>
            Start again
          </a>
          <button type="button" onClick={reset} className={BUTTON_SECONDARY}>
            Try this page again
          </button>
        </div>
      </main>
    </div>
  );
}
