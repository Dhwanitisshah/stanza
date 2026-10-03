# Stanza: project spec (CLAUDE.md)

Solo portfolio build. Pair-programmer mode: execute one phase at a time; the user says "next" to continue.

## 0. Context
- No deadline — portfolio build. Each phase must pass `npm run verify` before commit.
- Originally built for the FirstCommit hackathon (Devpost), whose deadline has passed.
- Judging: Learning & Growth 30%, Creativity & Impact 25%, Technical Execution 25%, Presentation 20%.
- Rules: all core work done during the event; repo must be public; significant AI help must be disclosed; judges value the author's understanding over AI-generated code.
- User: CS student, solo, VS Code on Windows + PowerShell. Use PowerShell-compatible commands and `curl.exe` (not `curl`).
- Working style: strict phases, commit at the end of each, a test or smoke check for every phase, short explanations (no essays).

## 1. Product
Stanza turns a poem you wrote into an animated typographic poster and an Instagram-ready reel.
**Positioning:** Every AI poetry app writes poems for you. Stanza never writes a word. It performs yours.
**Core idea:** the poem's own rhythm drives the animation. Syllables, stress and punctuation set timing; rhymes become visual echoes; AI-detected mood sets palette, typeface, easing and entrance style.
**Flow:** paste poem -> Stanza analyses -> live animated canvas preview -> light tweaks -> export video reel and/or PNG poster, or copy share link.

## 2. Locked decisions (do not change without asking)
| Area | Decision |
|---|---|
| Framework | Next.js (App Router) + TypeScript (strict) + Tailwind |
| Hosting | Vercel |
| LLM | Google Gemini via official `@google/genai`. Model from `GEMINI_MODEL` (default: current Flash). Server-side only. Key in `GEMINI_API_KEY`, never `NEXT_PUBLIC_*` |
| Language | English poems only |
| Rendering | Hand-rolled Canvas 2D engine. No GSAP, no Remotion |
| Export | Video reel (WebM, or MP4 where `MediaRecorder.isTypeSupported` allows) + PNG poster. No audio |
| Formats | Reel 9:16 (1080x1920), Post 4:5 (1080x1350) |
| Accounts | None. Share links encode poem + settings in URL hash (lz-string). No database |
| User control | AI auto-styles, then user can swap mood, palette, speed, format, re-roll emphasis, toggle rhyme echoes |
| App UI style | "Editorial paper": off-white paper (#F6F2EA-ish) with subtle grain, ink-black text, serif display headings, generous whitespace, like a literary magazine. App is quiet so posters are the colour |
| Tests | Vitest for all pure logic |

## 3. Architecture
```
src/
  app/
    page.tsx                 # landing + editor (single page app feel)
    api/analyze/route.ts     # Gemini call -> validated JSON
  lib/
    prosody/                 # PURE, no DOM, unit tested
      tokenize.ts            # lines, stanzas, words, punctuation
      syllables.ts           # CMU dict lookup + heuristic fallback
      stress.ts              # per-word stress pattern from CMU phonemes
      rhyme.ts               # rhyme key (last stressed vowel -> end) -> scheme e.g. ABAB
      analyze.ts             # combines into a ProsodyResult
    timeline/
      buildTimeline.ts       # PURE: (prosody, mood, speed) -> Timeline of word events
    render/
      layout.ts              # line breaking + font sizing to fit canvas safe area
      renderFrame.ts         # PURE-ish: renderFrame(ctx, scene, t) draws state at time t
      entrances.ts           # fade-rise, typewriter, ink-bleed, slam, drift
      texture.ts             # paper grain / noise background
    moods/presets.ts         # 6 mood presets (see 5)
    ai/schema.ts             # zod schema for Gemini output
    ai/fallback.ts           # deterministic mood/emphasis if API fails
    share/encode.ts          # lz-string URL hash encode/decode
    export/recordVideo.ts    # canvas.captureStream + MediaRecorder
    export/exportPng.ts
  components/                # Editor, PreviewCanvas, Controls, ExportPanel
tests/                       # vitest
scripts/smoke.ps1            # PowerShell smoke test
DEVLOG.md                    # learning log (see 7)
```
**Key design principle:** `renderFrame(ctx, scene, t)` must be a pure function of time `t`. Preview loop, scrubber, PNG export (renders the final frame) and video export all call the same function, so what the user sees is exactly what is exported.

## 4. Rhythm engine (the technical heart)
**Syllables and stress:** use the CMU Pronouncing Dictionary from npm (e.g. `cmu-pronouncing-dictionary`). Vowel phonemes carry stress digits 0/1/2. Unknown words fall back to a heuristic syllable counter (e.g. `syllable` package).

**Timing rules in `buildTimeline`:**
- Base beat per syllable = `beatMs / speed`.
- Stressed syllables get ~1.4x the duration of unstressed.
- Emphasis words (chosen by AI) get an extra hold plus the mood's emphasis treatment.
- Pauses: comma = short; semicolon or dash = medium; period/?/! = long; line break = line pause; stanza break = longest pause plus a scene beat (e.g. previous stanza dims).
- End with a "hold" so the full poster stays on screen ~2.5 s.
- Output: list of events `{wordId, start, duration, entrance, isEmphasis, rhymeGroup}` plus total duration.

**Rhyme echoes:** words sharing a rhyme group get a linked visual treatment (e.g. when the second rhyme lands, the first pulses in the same accent colour). Signature feature, since the author writes rhyming poetry.

## 5. Mood presets (`moods/presets.ts`)
Six presets: **Tender, Melancholy, Defiant, Joyful, Reverent, Restless.**
Each defines: palette (background, ink, accent, optional second accent); display + body fonts (Google Fonts via `next/font`, e.g. Fraunces, Cormorant Garamond, Playfair Display, Space Grotesk, DM Serif Display, Inter); easing curve; default entrance style; emphasis treatment (scale, colour, weight, underline-draw); background texture intensity; `beatMs`.
Make them genuinely distinct; a judge should tell them apart instantly.

## 6. Gemini `/api/analyze`
Input `{ poem: string }`. Cap at 2,000 chars / 40 lines; reject longer with a friendly error.
- Use structured JSON output (response schema). Prompt the model to **interpret, never rewrite**.
- Returns: `mood` (one of 6), `intensity` (0-1), `emphasis` (up to 2 word indices per line), `title` (from the poem's own words only), `paletteVariant`, one-sentence reading of the poem's feeling (shown in UI).
- Validate with zod. If call fails, times out (~8 s) or returns invalid data, use `ai/fallback.ts` (deterministic, keyword-based). The demo must never break.
- Simple in-memory rate limit per IP.

## 7. Learning-first rules (30% of score)
At the end of every phase append to `DEVLOG.md`: what was built; the key decision and why; one concept to understand (3-4 lines); any bug hit and the fix. Honest and brief; it becomes the Devpost "what I learned" and demo narration.
Before complex logic (rhyme detection, timeline, layout, recording) give a 3-5 bullet plan; wait for "ok" only if there is a real design choice. Name things clearly, keep functions small; the author must explain this code to judges.

## 8. Phases
| # | Phase | Done when |
|---|---|---|
| 0 | Scaffold: Next.js + TS + Tailwind + Vitest; `.env.example`, `.gitignore` (incl. `.env*.local`), DEVLOG.md, README stub, CLAUDE.md; git init; first commit "first commit: scaffold Stanza" | `npm run dev` + `npm test` pass |
| 1 | Prosody engine + tests: tokenize, syllables, stress, rhyme scheme | Tests cover >=3 sample poems incl. rhyme scheme detection |
| 2 | `/api/analyze` + zod + fallback + rate limit | `scripts/smoke.ps1` hits route (real key + forced fallback) |
| 3 | Timeline + layout + renderFrame + preview loop with play/pause/scrubber | Pasted poem animates correctly in both formats |
| 4 | 6 mood presets, entrances, rhyme echoes, paper texture | Each mood visually distinct |
| 5 | Editor UI (editorial paper), tweak controls, share-link encode/decode, 2 public-domain sample poems (pre-1929 only) | Share link round-trips the exact poster |
| 6 | Export: video reel + PNG, progress indicator, filename `stanza-<title>.webm/.mp4/.png` | Exported files open and match preview |
| 7 | Deploy to Vercel, env vars, mobile check, empty/long/weird-input hardening, loading/error states | Live URL works end to end |
| 8 | Docs: README, AI disclosure, Devpost draft, demo script | See 9 |

Commit at the end of every phase with a clear message, e.g. `phase 1: prosody engine + tests`.

## 9. Phase 8 deliverables
**README.md:** tagline + screenshots; features; how it works (Mermaid flowchart: poem -> prosody -> AI mood -> timeline -> renderFrame -> preview/export); tech stack; local setup (Windows + macOS/Linux); env vars; running tests; project structure; known limitations; "AI Disclosure" section (README + Devpost).
State honestly: Claude Code used as a pair-programmer for scaffolding and implementation; the author directed design, made product decisions, reviewed and tested the code; Gemini is used at runtime only to interpret mood and emphasis and never generates poem text.
**DEVPOST.md:** Inspiration, What it does, How we built it, Challenges, Accomplishments, What we learned (from DEVLOG.md), What's next.
**DEMO_SCRIPT.md:** 3-5 min shot list: Hook (own poem becoming a reel); Problem (AI apps replace the poet); Live demo (paste -> analyze -> moods -> rhyme echoes -> tweak -> export); Under the hood (rhythm engine, "renderFrame is a pure function of time"); Challenges + learnings; Close.

## 10. Guardrails
- Never commit `.env.local`. Gemini key is server-only.
- No localStorage dependency for core features.
- Don't add libraries beyond what's needed. Ask before adding anything heavy.
- Copyright: sample poems must be public domain (pre-1929). Never bundle copyrighted poems.
- If a phase grows much larger than planned, stop and propose a scope cut.
