# Stanza

[![CI](https://github.com/Dhwanitisshah/stanza/actions/workflows/ci.yml/badge.svg)](https://github.com/Dhwanitisshah/stanza/actions/workflows/ci.yml)

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

`npm run verify` runs the whole quality gate (typecheck, lint, tests, production build) and stops at the first failure. It is plain Node, so it is the same command on Windows, macOS and Linux, and it is exactly what CI runs on every push and pull request to `main`.

## Environment variables

Copy `.env.example` to `.env.local` for local work; set the same names in the Vercel project for a deploy. Only the variables marked **public** may start with `NEXT_PUBLIC_`: they are baked into the page and visible to every visitor. Everything else stays on the server.

| Variable | Secret? | Default | What it does |
|---|---|---|---|
| `GEMINI_API_KEY` | **Secret** | none | Google Gemini key. Without it, Stanza uses its built-in fallback reader. |
| `GEMINI_MODEL` | no | `gemini-flash-lite-latest` | Which Gemini model reads the poem. |
| `AI_ENABLED` | no | on | **Kill switch.** `false` (or `0`, `off`, `no`) stops every Gemini call for everyone; Stanza keeps working on the fallback reader. |
| `GEMINI_DAILY_CAP` | no | `500` | At most this many Gemini calls per server instance per UTC day. Over the cap, requests use the fallback reader (no error). `0` means none. |
| `FORCE_FALLBACK` | no | off | `1` skips Gemini (used by the tests and smoke script). |
| `NEXT_PUBLIC_SITE_URL` | public | auto on Vercel | The public address, for the canonical URL and the share image. Set it with a custom domain. |
| `NEXT_PUBLIC_ANALYTICS` | public | `false` | `true` turns on anonymous, cookieless page counts (Vercel Web Analytics). |
| `NEXT_PUBLIC_SUPPORT_URL` | public | empty | An optional "buy me a chai" link, shown once after a reel is exported. |

### Cost and abuse guards

Gemini is the only thing here that costs money, so three layers sit in front of it. Every one of them ends in the fallback reader, never in an error, so a visitor always gets a poster:

1. **Per-IP limit:** 20 requests a minute per IP (built in).
2. **`GEMINI_DAILY_CAP`:** a daily ceiling on Gemini calls per server instance. Only real Gemini calls are counted: a request that skips the AI, or one the kill switch turned away, costs nothing against it.
3. **`AI_ENABLED=false`:** the kill switch for when something looks wrong.

Honest limits: the per-IP limit and the daily cap are counted in memory, and on Vercel every warm serverless instance keeps its own counters. They bound a burst; they are not a billing cap. For a hard ceiling, also set a budget alert on the Google AI Studio / Cloud project that owns the key. Visitors can also switch **Read with AI** off, in which case their poem is never sent to Google (see `/privacy`).

## API: `POST /api/analyze`

Body `{ "poem": string, "skipAi"?: boolean }` (max 2,000 characters and 40 lines), sent as `Content-Type: application/json`, at most 16 KB. Anything else is refused before any work is done: another method gets `405` (with `Allow: POST`), another content type `415`, a larger body `413`. The route runs on the Node.js runtime (the CMU dictionary is ~4.7 MB) with `maxDuration = 15` seconds.
Returns `{ prosody, analysis, source }` where `source` is `"gemini"`, `"fallback"` (Gemini failed, timed out at 8 s, returned something invalid, or was switched off or over its daily cap) or `"skipped"` (`skipAi: true`: a share link, or "Read with AI" off). Errors are `{ error: { code, message } }`.

Gemini only interprets the poem (mood, emphasis, a title built from the poem's own words, one sentence of reading). It never writes or rewrites text. If it is unavailable, a deterministic keyword-based fallback is used, so the app keeps working.

Smoke test against a running dev server: `powershell -File scripts/smoke.ps1`

## Security and privacy

- **Content-Security-Policy** (set per request in `src/proxy.ts`, built in `src/lib/security/csp.ts`): same-origin by default; scripts run only with a fresh per-request nonce (`'strict-dynamic'`, no `'unsafe-inline'`, no `eval` in production); `img-src 'self' blob: data:`, `worker-src 'self' blob:`, `connect-src 'self'`, `frame-ancestors 'none'`. The one loose spot is `style-src 'unsafe-inline'`, because React writes `style="..."` attributes and a nonce cannot cover an attribute. Styles cannot run code.
- **Other headers** (`next.config.ts`): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation off), `X-Frame-Options: DENY`, HSTS.
- **Pages are rendered per request**, because a nonce must be new each time. That means no CDN caching of the HTML; the JavaScript, CSS and fonts are still static and cached.
- **The privacy page** (`/privacy`) says in plain English what happens to a poem, photos and share links. Share links hold the poem itself in the `#hash`, which browsers never send to a server.
- **No poem text in metadata:** the page title, description and share image are the same for everyone.
- `npm run ui-check` and `npm run export-check` run the real app in a headless browser with all of this switched on and fail on a single CSP violation.

## Third-party licences

Stanza's own code is the author's. What it ships with:

| Part | Licence | Notes |
|---|---|---|
| [Mediabunny](https://github.com/Vanilagy/mediabunny) | **MPL-2.0** | Writes the MP4 files. Used unmodified, loaded only when someone exports. MPL-2.0 is file-level: changes to Mediabunny's own files would have to be shared, and nothing of Stanza's own code is affected. |
| [CMU Pronouncing Dictionary](http://www.speech.cs.cmu.edu/cgi-bin/cmudict) via `cmu-pronouncing-dictionary` | public domain data (CMU); the npm package is ISC | Syllables and stress for ~134,000 English words. |
| Fonts: Instrument Serif, Geist, Geist Mono, Cormorant Garamond, Inter, Space Grotesk, Fraunces, DM Serif Display, Space Mono | **SIL Open Font License 1.1** | Fetched from Google Fonts at build time and served by Stanza itself (no request to Google from a visitor's browser). Free to use and embed, including in exported videos and images. |
| Next.js, React, React DOM, `@vercel/analytics`, `lz-string`, `syllable`, `server-only` | MIT | |
| `zod` | MIT | |
| `@google/genai` | Apache-2.0 | The official Gemini SDK. |

The sample poems are the author's own or in the public domain (pre-1929).
