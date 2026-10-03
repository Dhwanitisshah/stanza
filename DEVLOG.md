# Stanza DEVLOG

Learning log for the FirstCommit hackathon. One entry per phase.

## Phase 0: Scaffold

**Built:** Next.js (App Router) + TypeScript strict + Tailwind, Vitest, folder skeleton from the spec, `.env.example`, `.gitignore` that blocks `.env` and `.env*.local`, CLAUDE.md (the spec).

**Key decision:** Vitest runs in the `node` environment. All core logic (prosody, timeline) is pure and DOM-free, so tests are fast and don't need jsdom.

**Concept:** A *pure function* returns the same output for the same input and touches nothing outside itself. Stanza's `renderFrame(ctx, scene, t)` will depend only on the scene and time `t`, so the preview, scrubber, PNG and video export all produce identical frames.

**Bug:** `npm i -D vitest` failed with ERESOLVE. create-next-app pinned `@types/node@20`, but Vitest 5 needs `^22 || >=24`. Fix: upgrade `@types/node` to 22 (matches installed Node 22) instead of using `--force`.

## Status audit + repo move

**Built:** Moved the repo out of OneDrive to `C:\dev\stanza`, audited it against the spec (only Phase 0 done), and added `npm run verify` (typecheck → lint → test → build, stop on first failure). Project is now a no-deadline portfolio build.

**Key decision:** One `verify` gate per phase instead of ad-hoc checks, so "done" means the same thing every time.

**Bug / lesson:** `tsc --noEmit` failed on a fresh checkout with `Cannot find name 'LayoutProps'`. Next generates global route types (`LayoutProps`, `PageProps`) into `.next/`, which is gitignored, so a clean clone has none. Fix: `next typegen && tsc --noEmit` regenerates them first. Also renamed `vitest.config.ts` to `.mts` so Vite loads it as ESM instead of warning about CommonJS.
