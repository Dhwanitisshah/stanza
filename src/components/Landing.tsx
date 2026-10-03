"use client";

import { useRef, useState } from "react";
import type { MoodId } from "@/lib/moods/ids";
import { MOOD_PRESETS } from "@/lib/moods/presets";
import { poemProblem } from "@/lib/editor/analyzeClient";
import { SAMPLES } from "@/lib/samples";
import { Logo } from "./Logo";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Eyebrow, FIELD } from "./ui";

const LAMP_LINES = ["The lamp burns low beside the door,", "the kettle hums a quiet tune,", "the rain has found the wooden floor,", "and somewhere far, a patient moon."];

/** A tiny CSS poster, standing in for a real render: the mood's palette, typeface and alignment. */
function MiniPoster({ mood, caption, className = "" }: { mood: MoodId; caption: string; className?: string }) {
  const preset = MOOD_PRESETS[mood];
  const palette = preset.palettes[0];
  const centred = preset.typography.align === "center";
  return (
    <figure className={`m-0 ${className}`}>
      <div
        aria-hidden
        className="relative aspect-[9/16] w-full overflow-hidden rounded-[3px] shadow-[0_18px_40px_-18px_rgba(28,26,23,0.45)] [container-type:inline-size]"
        style={{ background: palette.background, color: palette.ink }}
      >
        <div
          className="absolute inset-x-[8%] top-[44%] -translate-y-1/2 text-[4.4cqw] leading-[1.9]"
          style={{ fontFamily: preset.typography.display, fontWeight: preset.typography.weight, fontStyle: preset.typography.italic ? "italic" : "normal", textAlign: centred ? "center" : "left" }}
        >
          {LAMP_LINES.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <div className="absolute inset-x-[8%] bottom-[8%] text-[2.6cqw] tracking-widest opacity-70" style={{ fontFamily: preset.typography.display, textAlign: centred ? "center" : "left" }}>
          A PATIENT MOON
        </div>
      </div>
      <figcaption className="mt-2 text-sm text-muted">{caption}</figcaption>
    </figure>
  );
}

const HOW: { numeral: string; title: string; body: string }[] = [
  {
    numeral: "i.",
    title: "Syllables set the tempo",
    body: "Every word is split into syllables with the CMU pronouncing dictionary. Stressed syllables hold longer; commas, line breaks and stanza breaks become rests.",
  },
  {
    numeral: "ii.",
    title: "Rhymes answer each other",
    body: "When a rhyme lands, its partner lights up in the accent colour, so the scheme (ABAB, AABB) is something you watch happen rather than read about.",
  },
  {
    numeral: "iii.",
    title: "Mood chooses the voice",
    body: "An AI reading picks one of six moods: typeface, palette, motion. It interprets the poem and never rewrites a line. You can always overrule it.",
  },
];

export function Landing({
  onPerform,
  banner,
  initialPoem = "",
  initialTitle = "",
}: {
  onPerform: (poem: string, title: string) => void;
  /** A friendly message, e.g. about a share link that could not be opened. */
  banner?: string;
  initialPoem?: string;
  initialTitle?: string;
}) {
  const [poem, setPoem] = useState(initialPoem);
  const [title, setTitle] = useState(initialTitle);
  const [problem, setProblem] = useState<string | null>(null);
  const poemRef = useRef<HTMLTextAreaElement>(null);

  function perform() {
    const issue = poemProblem(poem);
    setProblem(issue);
    if (issue) {
      poemRef.current?.focus();
      return;
    }
    onPerform(poem, title.trim());
  }

  function fillSample(id: string) {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    setPoem(sample.poem);
    setTitle(sample.title);
    setProblem(null);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-rule px-5 py-4 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-3 sm:gap-5">
          <a href="#how" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
            How it reads
          </a>
          <button type="button" className={BUTTON_SECONDARY} onClick={() => poemRef.current?.focus()}>
            Open the editor
          </button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-5 sm:px-8">
        {banner && (
          <p role="status" className="mt-6 rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
            {banner}
          </p>
        )}

        <section className="grid gap-12 py-12 lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)] lg:items-center lg:py-20">
          <div className="min-w-0">
            <p className="eyebrow !text-accent">For people who write poems</p>
            <h1 className="mt-5 font-serif text-[clamp(2.75rem,7vw,4.5rem)] leading-[0.98] tracking-tight">
              You wrote the poem. <em className="italic">Stanza gives it a pulse.</em>
            </h1>
            <p className="mt-7 max-w-[34rem] text-base leading-7 text-ink/85">
              Paste something you wrote. Stanza listens for its syllables, stresses and rhymes, then sets every word moving on that rhythm: a poster and a reel, ready for Instagram. It never writes a word for you.
            </p>

            <form
              className="mt-8 flex flex-col gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                perform();
              }}
            >
              <div className="flex flex-col gap-2">
                <label htmlFor="landing-title">
                  <Eyebrow optional="optional">Title</Eyebrow>
                </label>
                <input
                  id="landing-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  placeholder="Leave blank and Stanza will suggest one from your own words"
                  className={`${FIELD} min-h-12 font-serif text-xl`}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="landing-poem">
                  <Eyebrow>Your poem</Eyebrow>
                </label>
                <textarea
                  id="landing-poem"
                  ref={poemRef}
                  value={poem}
                  onChange={(event) => setPoem(event.target.value)}
                  rows={8}
                  aria-invalid={problem ? true : undefined}
                  aria-describedby={problem ? "landing-problem" : undefined}
                  placeholder="Paste your poem here. Up to 40 lines, English for now."
                  className={`${FIELD} min-h-48 resize-y py-3 font-serif text-xl leading-snug`}
                />
                {problem && (
                  <p id="landing-problem" role="alert" className="text-sm text-accent">
                    {problem}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <button type="submit" className={`${BUTTON_PRIMARY} px-6`}>
                  Perform it
                </button>
                <span className="text-sm text-muted">No account. Your poem travels inside the link you share.</span>
              </div>
            </form>

            <p className="mt-6 text-sm text-muted">
              Or try a sample:{" "}
              {SAMPLES.map((sample, i) => (
                <span key={sample.id}>
                  {i > 0 && " · "}
                  <button type="button" onClick={() => fillSample(sample.id)} className="inline-flex min-h-11 items-center text-ink underline underline-offset-4">
                    {sample.label}
                  </button>{" "}
                  ({sample.attribution})
                </span>
              ))}
            </p>
          </div>

          <div className="hidden min-w-0 items-end justify-center gap-6 lg:flex" aria-label="Three moods, one poem">
            <MiniPoster mood="Melancholy" caption="Melancholy" className="w-[27%]" />
            <MiniPoster mood="Tender" caption="Tender" className="w-[31%] -translate-y-10" />
            <MiniPoster mood="Defiant" caption="Defiant" className="w-[27%]" />
          </div>
        </section>

        <section id="how" className="scroll-mt-6 border-t border-rule py-14">
          <h2 className="font-serif text-4xl">How Stanza reads a poem</h2>
          <ol className="mt-9 grid gap-9 md:grid-cols-3">
            {HOW.map((step) => (
              <li key={step.numeral}>
                <span className="font-serif text-3xl italic text-accent" aria-hidden>
                  {step.numeral}
                </span>
                <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink/80">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
