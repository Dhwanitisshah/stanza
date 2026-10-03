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

## Phase 2: /api/analyze

**Built:** `POST /api/analyze` (Node runtime): validates the request, runs the prosody engine, asks Gemini for mood, intensity, emphasis, title, palette variant and a one-sentence reading, then checks the answer against the poem. `lib/ai/` holds the zod schema, the Gemini client, the sanitiser, the deterministic fallback, the pipeline and an in-memory rate limiter. `skipAi` returns prosody plus the fallback analysis for share-link loads. 116 tests with Gemini mocked, and `scripts/smoke.ps1` against the running server.

**Key decision:** never trust the model. Gemini sees each word with its prosody id (`w12=lamp`), so emphasis comes back as ids that either exist or get dropped (max 2 per line). The title must be made of the poem's own words or it is replaced by the first words of line one. Anything that fails validation, times out (8 s) or throws becomes the fallback, so the route has no failure path that returns a 500 for AI reasons. The poem goes in a delimited block that is described as untrusted data, and `<` `>` are stripped from it so it cannot close the block.

**Concept:** prompt injection. Anything a user types ends up in the model's context, so it can contain instructions. Defence is layered: delimit and label the data, constrain the output with a schema, then validate the output against known facts (here: the poem's real word ids and vocabulary). The last step matters most, because it holds even if the model is fooled.

**Bugs / lessons:** (1) `server-only` throws in plain Node, so Vitest aliases it to an empty stub; in Next it makes a client import fail the build (checked with a throwaway client page). (2) `gemini-flash-latest` is valid (it currently points at `gemini-3.8-flash`) but took ~4.5 s on a tiny call and sometimes returned 429/503, which is too close to the 8 s timeout. `gemini-flash-lite-latest` answered in ~1.1 s, and the full pipeline ran in 1.3 s with it. The default in `.env.example` is unchanged, with a comment. (3) My own injection test failed because "reveal your key" was literally in the injected poem, so the title was legitimately made of poem words. The test was wrong, not the code.

## Phase 3a: Timeline + layout (pure, no drawing yet)

**Built:** `lib/render/types.ts` and `lib/moods/types.ts` (Scene, Layout, the four timeline event types, the full MoodPreset with Tender as the only placeholder preset); `buildTimeline` with every knob in `timeline/config.ts`; `layout` with an injected `measureText`; `buildScene` to combine them; `npm run timeline -- <fixture>` to print the rhythm as a table. 189 tests in total (73 new for timeline and layout).

**Key decisions:** (1) Pauses are measured in *beats* so they stretch with mood and speed, and they ADD: a line ending in a period waits `long + line`, but a stanza break replaces the line break instead of stacking on it. (2) Layout runs before the timeline, because a page change is a timeline event: `layout.pageOfLine` is passed to `buildTimeline`. (3) Font size is found by binary search on a monotone question ("does everything fit at this size?"), about 7 tries instead of scanning every size. If the text can't fit one page at 44px it packs whole stanzas into pages, then looks for the largest size that keeps that same page count. A stanza taller than a page is split at line boundaries. (4) The minimum is 44px on a 1080px-wide poster, about 16pt on a phone.

**Concept:** dependency injection for testability. `layout` never touches a canvas: it receives `measureText(text, font)` as a parameter. The app will pass a canvas-backed one; the tests and the CLI pass a fake monospace one. The same trick makes the whole pipeline a pure function, which is what will let the preview, the scrubber, PNG export and video export all draw the same frame.

**Bugs:** (1) A single line taller than the page counted as "fits on one page": my page packer puts an over-tall line on a page of its own, so `pages.length === 1` was true. Fix: check that every page's real height fits. (2) When a word too long for a row was split into chunks, every chunk was sized for the first row and ignored the hanging indent, so continuation chunks overflowed the right margin. Both were caught by the safe-area test, not by eye. Known limits: emphasis is drawn bold and 8% larger but laid out at normal weight, so an emphasised word at the end of a full row may poke slightly into the 96px side margin (still inside the canvas); and the title is not drawn yet.

## Tuning: rhythm + emphasis

After eyeballing the Phase 3a table: auxiliary and modal verbs (has, had, will, could...) are now unstressed like other function words; Tender's beat went from 340 to 240 ms (the poem went from 21.5 s to 14.9 s, pause beat counts unchanged); the fallback now emphasises at most ONE word per stanza, the line-final content word of the stanza's strongest line (mood keywords, then rhyme, then longest word as the tie-break), because one emphasised word per line stopped being emphasis. Layout now measures emphasised words in their own bold, +8% font, so they can't cross the safe area: a test sweeps 60 line lengths and also proves that plain measurement WOULD have overflowed for some of them. Lesson: a test that can't fail proves nothing, so the sweep includes a negative control.

## Phase 3b: renderFrame + preview player

**Built:** `renderFrame(ctx, scene, t, resources)` plus its helpers (`easing`, `entrances`, seeded paper grain in `texture`, a per-scene `frameIndex`); a playback state machine (`createPlayer`) wrapped by `usePlayer`; browser glue (`browser.ts`: font loading, canvas-backed `measureText`, grain canvas); `useScene`; `PreviewCanvas` (canvas, scrubber, play/pause/restart, loop, time readout, Space); and a clearly marked TEMP `DevHarness` on the home page. Fonts now come from `next/font` (Cormorant Garamond, Inter). 252 tests, and I drove the real page in headless Edge to look at actual canvas pixels.

**Key decisions:** (1) `renderFrame` takes everything it needs as arguments. The frame index and the grain image are *inputs* built once per scene by the caller, so there is no hidden cache and "same t, same pixels" is easy to prove. (2) The final frame is the poster, so dimmed stanzas fade back to full strength during the final hold. Without that an earlier stanza would stay at 35% in the last frame. (3) The player is plain TypeScript with an injectable scheduler: its play/pause/loop/seek logic is unit-tested with a hand-driven clock, and React only subscribes to it through `useSyncExternalStore`. (4) Fonts: presets say `var(--font-cormorant)`; the browser resolves that to the real family name from computed style before layout. The scene is never built until `document.fonts.load` has confirmed every font and weight (so we never measure with a fallback), and it is rebuilt on a late `loadingdone` only if the layout actually changed.

**Concept:** purity as a testing strategy. A recording mock context logs every draw call with the canvas state it was made in. Render t=5000, t=12000, t=5000 again and the first and last logs must be byte-identical: if any hidden state leaked between calls, they would differ. This is also what guarantees preview, scrubber, PNG and video export all show the same frame.

**Bugs:** (1) The recording mock first ignored `save()`/`restore()`, so state leaked between frames in my own test. A real canvas restores it, so the mock now does too. (2) A lint rule (`react-hooks/refs`) rejected passing a ref into the player initializer; the fix was better design: `player.setDraw(fn)` instead of a ref. (3) My echo test looked at the last draw call, which was a later word, not the echo overlay; test bug. **Seen in the browser, not fixed (Phase 4/5):** verse lines wrap with a hanging indent at the largest size that fits one page, so "the kettle hums a / quiet tune," reads like prose; the echo accent (accent2) is pale on the paper background; the canvas PNG is ~3 MB because grain is incompressible noise.

## Layout: verse-aware sizing

Watching the real poster showed verse lines wrapping mid-line ("the kettle hums a / quiet tune,") because sizing maximised the font to fill one page. A line break in a poem is the poet's choice, so the new priority is: (a) the largest size (capped at 110px) where NO line wraps and everything fits one page; (b) if that is below the 44px minimum, still no wrapping, but whole stanzas on separate pages at the largest size that needs no more pages than 44px does; (c) only a line that cannot fit unwrapped even at 44px wraps, with a hanging indent. Measured in headless Edge with real Cormorant Garamond (font px, wrapped lines out of 4): ABAB Reel/Post 112/102 with 4 wrapped -> 62/62 with 0; AABB 111/102 with 4 -> 62/62 with 0; free-verse 112/112 with 3 -> 67/67 with 0. The text is smaller, the poem is intact. Bug found while testing: with splitting disabled an over-wide word sat alone on a row, so "no line wraps" was true even though the word overflowed. "Unwrapped" now also requires every word to fit. Lesson: a fake monospace font (0.6 em per char) is much wider than Cormorant (about 0.42 em), so a unit test about "does this poem wrap" needs a realistic fake; the real-browser numbers come from `npm run layout-stats`.

## Phase 4: six moods, entrances, echoes

**Built:** six presets (Tender, Melancholy, Defiant, Joyful, Reverent, Restless), each with its own palette (3 variants), typeface, alignment, entrance, easing, tempo, emphasis treatment, echo style, grain and footer style; five pure entrance functions (`progress -> {opacity, dx, dy, scale, blur, visibleChars}`); echo styles (colour pulse, underline link, glow); a title and optional byline in a quiet footer that fades in during the final hold; spelling-based rhymes for words the dictionary doesn't know; and the dev tools `npm run posters -- <fixture>` (all six moods, final + mid-animation frames and a contact sheet, from the production build in headless Edge) and `npm run perf`. 466 tests.

**Key decisions:** (1) Quality gates are tests, not taste: ink on background >= 7:1 and every accent/echo/emphasis colour >= 3:1 for all 18 palettes (this fixes the pale #D9BE98 echo), and every one of the 15 mood pairs must differ in at least 4 of 8 attributes (font, light/dark, alignment, entrance, easing, tempo bucket, emphasis, echo). (2) No `ctx.filter`: ink-bleed draws the glyph far off-canvas with `shadowOffsetX` so only its blurred shadow lands on screen, crossfading into the sharp glyph; glow uses `shadowBlur`. Both work in Safari. (3) Typewriter never measures: it draws prefixes of a word from a table built once per scene, anchored at the word's fixed left edge. (4) The footer fade is part of the 2.5 s final hold and does not lengthen the poem. Layout reserves a footer strip on every page, so adding a byline never moves the poem.

**Concept:** you can test "does this look different?" and "is this readable?" with numbers. WCAG contrast is a formula on relative luminance; distinctness is a count of differing attributes. Neither replaces looking at the posters, but they stop a later palette tweak from quietly breaking readability or making two moods converge.

**Bugs:** (1) The footer first extended `totalMs` (its fade counted as an event end); it now fades inside the final hold. (2) Restless's highlighter bar failed the readability gate in one variant (ink on the bar 2.88:1); the accent was nudged until both bar-on-paper and ink-on-bar were >= 3:1. (3) An entrance returning `-0` for "no offset" made `Object.is(dy, 0)` false at rest; the drift formula is now written so rest is a clean zero. (4) A stale `next dev` from an earlier session blocked the perf run: the tool now fails with a clear message instead of hanging. **Performance:** dev frame log on the 40-line fixture, headless Edge: 0.28 / 0.34 / 0.40 / 0.46 / 0.43 / 0.39 ms per frame for Tender / Melancholy / Defiant / Joyful / Reverent / Restless (typewriter). That times issuing the canvas commands, not GPU rasterisation, so it is a lower bound on real cost. **Known limits:** spelling rhymes are weak (any two "-ic" words match as near); Restless's wide monospace wraps lines earlier than the serif moods; the byline field has no real UI until Phase 5.
