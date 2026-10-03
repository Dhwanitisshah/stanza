# Stanza DEVLOG

Learning log for the Stanza build. One entry per phase.

## Phase 0: Scaffold

**Built:** Next.js (App Router) + TypeScript strict + Tailwind, Vitest, folder skeleton from the spec, `.env.example`, `.gitignore` that blocks `.env` and `.env*.local`, CLAUDE.md (the spec).

**Key decision:** Vitest runs in the `node` environment. All core logic (prosody, timeline) is pure and DOM-free, so tests are fast and don't need jsdom.

**Concept:** A *pure function* returns the same output for the same input and touches nothing outside itself. Stanza's `renderFrame(ctx, scene, t)` will depend only on the scene and time `t`, so the preview, scrubber, PNG and video export all produce identical frames.

**Bug:** `npm i -D vitest` failed with ERESOLVE. create-next-app pinned `@types/node@20`, but Vitest 5 needs `^22 || >=24`. Fix: upgrade `@types/node` to 22 (matches installed Node 22) instead of using `--force`.

## Status audit + repo move

**Built:** Moved the repo out of OneDrive to `C:\dev\stanza`, audited it against the spec (only Phase 0 done), and added `npm run verify` (typecheck → lint → test → build, stop on first failure). Project is now a no-deadline portfolio build.

**Key decision:** One `verify` gate per phase instead of ad-hoc checks, so "done" means the same thing every time.

**Bug / lesson:** `tsc --noEmit` failed on a fresh checkout with `Cannot find name 'LayoutProps'`. Next generates global route types (`LayoutProps`, `PageProps`) into `.next/`, which is gitignored, so a clean clone has none. Fix: `next typegen && tsc --noEmit` regenerates them first. Also renamed `vitest.config.ts` to `.mts` so Vite loads it as ESM instead of warning about CommonJS.

## Phase 1: Prosody engine

**Built:** `lib/prosody/` with `tokenize` (stanzas → lines → words, punctuation kept on the word), `syllables` (CMU lookup, all pronunciation variants, `syllable` heuristic fallback), `stress` (stress digits from vowel phonemes, function-word demotion), `rhyme` (tails, two-tier strength, scheme detection) and `analyze` (everything combined into a `ProsodyResult`). 64 tests, including three public-domain poems (Wordsworth ABABCC, Blake AABB, Whitman free verse) and 20 edge-case inputs that must never throw.

**Key decision:** Rhymes carry a strength: `perfect` (same sounds from the last stressed vowel), `near` (same vowel, final consonants in the same class, e.g. time/mine) or `repeat` (same word twice). They share a scheme letter so the scheme still reads ABAB, but Phase 4 can echo a near rhyme more softly. Rhyme uses the raw CMU phonemes, not the demoted stress, so "my/sky" still rhymes.

**Concept:** A rhyme isn't about spelling, it's the sounds from the *last stressed vowel* onward. "daffodils" rhymes with "hills" because both end in IH-L-Z, even though the first syllable is nowhere near. CMU gives us the phonemes, so rhyme detection is just comparing the tails of two phoneme lists.

**Bugs / gaps:** `dictionary["constructor"]` returned a function, since the dictionary is a plain object. Lookups use `Object.hasOwn` and there is a test for it. CMU has no `o'er` or `heav'n`, so a small elision table maps them to the full word. Known limits: unknown (heuristic) words can only "repeat", never rhyme; a possessive missing from CMU gets a Z sound but no extra syllable; `TESTING.md` was missing, so the fixtures are my own.

Prosody is server-only: the CMU dictionary is a ~4.7 MB module that must not reach the browser bundle.
