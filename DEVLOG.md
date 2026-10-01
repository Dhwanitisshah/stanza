# Stanza DEVLOG

Learning log for the FirstCommit hackathon. One entry per phase.

## Phase 0: Scaffold

**Built:** Next.js (App Router) + TypeScript strict + Tailwind, Vitest, folder skeleton from the spec, `.env.example`, `.gitignore` that blocks `.env` and `.env*.local`, CLAUDE.md (the spec).

**Key decision:** Vitest runs in the `node` environment. All core logic (prosody, timeline) is pure and DOM-free, so tests are fast and don't need jsdom.

**Concept:** A *pure function* returns the same output for the same input and touches nothing outside itself. Stanza's `renderFrame(ctx, scene, t)` will depend only on the scene and time `t`, so the preview, scrubber, PNG and video export all produce identical frames.

**Bug:** `npm i -D vitest` failed with ERESOLVE. create-next-app pinned `@types/node@20`, but Vitest 5 needs `^22 || >=24`. Fix: upgrade `@types/node` to 22 (matches installed Node 22) instead of using `--force`.
