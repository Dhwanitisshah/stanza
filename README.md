# Stanza

> Every AI poetry app writes poems for you. Stanza never writes a word. It performs yours.

Stanza turns a poem you wrote into an animated typographic poster and an Instagram-ready reel, driven by the poem's own rhythm.

A solo portfolio project. Full docs (features, setup, architecture, AI disclosure) arrive in Phase 8.

## Quick start

```powershell
npm install
Copy-Item .env.example .env.local   # then add your GEMINI_API_KEY
npm run dev
npm test
```

## API: `POST /api/analyze`

Body `{ "poem": string, "skipAi"?: boolean }` (max 2,000 characters and 40 lines).
Returns `{ prosody, analysis, source }` where `source` is `"gemini"`, `"fallback"` (Gemini failed, timed out at 8 s or returned something invalid) or `"skipped"` (`skipAi: true`, used when loading a share link). Errors are `{ error: { code, message } }`.

Gemini only interprets the poem (mood, emphasis, a title built from the poem's own words, one sentence of reading). It never writes or rewrites text. If it is unavailable, a deterministic keyword-based fallback is used, so the app keeps working.

**Rate limit:** 20 requests per minute per IP, held in memory. On Vercel each serverless instance keeps its own counter, so the limit resets whenever an instance is recycled and is not shared between instances. That is fine for a portfolio project, but it is not a real abuse defence.

**Environment variables** (server-side only, see `.env.example`): `GEMINI_API_KEY`, `GEMINI_MODEL`, `FORCE_FALLBACK=1` to skip Gemini.

Smoke test against a running dev server: `powershell -File scripts/smoke.ps1`
