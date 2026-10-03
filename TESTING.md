# Stanza: Manual Crosscheck Checklist

Run these yourself after each phase. Don't take Claude Code's "done" at face value: a phase is done only when every box under it is ticked.
All commands are **PowerShell** and are run from `C:\dev\stanza`.

---

## Always: the baseline gate (run before every commit)

```powershell
npm run verify        # typecheck → lint → test → build, must print PASS for all 4
git status            # should be clean after commit
git log --oneline -5  # each phase has its own commit
```

- [ ] `npm run verify` passes. `npm run build` catches errors that `npm run dev` hides.
- [ ] `git check-ignore .env.local` prints `.env.local`, which means the key file is ignored.
- [ ] `git ls-files .env.example` prints `.env.example`, which means the template is tracked.

---

## Test poems (originals, safe to commit)

Save these as `tests/fixtures/` or paste them into the app.

**ABAB**
```
The lamp burns low beside the door,
the kettle hums a quiet tune,
the rain has found the wooden floor,
and somewhere far, a patient moon.
```

**AABB**
```
I folded every letter small
and hid them in the hallway wall;
the house forgot, the paint grew old,
but still the paper kept the cold.
```

**Free verse (expect no scheme)**
```
Traffic at six.
A man sells guavas from a bicycle,
counting change in a language
older than the signal lights.
```

**Edge cases**
- empty string
- a single word: `Hello`
- 40+ lines (should be rejected politely)
- emoji line: `the sea 🌊 keeps its promises`
- ALL CAPS
- words not in the dictionary: `Pimpri chai wallah`
- trailing spaces and blank lines between stanzas

---

## Phase 1: Prosody engine

```powershell
npm test -- prosody
```

- [ ] Syllable counts look sane: `beautiful` = 3, `moon` = 1, `quiet` = 2, `fire` = 1 or 2 (both acceptable).
- [ ] ABAB poem → scheme `ABAB`. AABB poem → `AABB`. Free verse → no strong scheme.
- [ ] Unknown words (`wallah`) don't crash. They get a heuristic syllable count.
- [ ] Punctuation is stripped before rhyme check (`door,` rhymes with `floor,`).
- [ ] `day / day` (an identical word) is not counted as a strong rhyme.
- [ ] Stanza breaks (blank lines) are detected. The ABAB poem with a blank line in the middle = 2 stanzas.

**Bundle check: the CMU dictionary must NOT ship to the browser**
```powershell
npm run build
Get-ChildItem .next\static -Recurse -Filter *.js | Select-String -Pattern 'aardvark' -List
```
- [ ] Prints **nothing**. If it finds matches, the dictionary is in the client bundle.

---

## Phase 2: `/api/analyze` (Gemini + fallback)

Start the server first with `npm run dev`. Then, in a second terminal:

```powershell
# Happy path
$body = @{ poem = "The lamp burns low beside the door,`nthe kettle hums a quiet tune,`nthe rain has found the wooden floor,`nand somewhere far, a patient moon." } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/api/analyze -Method Post -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 6
```
- [ ] Response includes `mood` (one of the 6 presets), `intensity` between 0 and 1, `emphasis`, `title`, `reading` and the prosody data.
- [ ] `title` uses words from the poem, and nothing in the response rewrites the poem.

```powershell
# Too long → expect a 400 with a friendly message
$long = @{ poem = ("a line`n" * 50) } | ConvertTo-Json
try { Invoke-RestMethod -Uri http://localhost:3000/api/analyze -Method Post -ContentType 'application/json' -Body $long } catch { $_.Exception.Response.StatusCode.value__ }

# Empty → expect 400
$empty = @{ poem = "" } | ConvertTo-Json
try { Invoke-RestMethod -Uri http://localhost:3000/api/analyze -Method Post -ContentType 'application/json' -Body $empty } catch { $_.Exception.Response.StatusCode.value__ }

# Rate limit → expect 429 after the limit
1..25 | ForEach-Object { try { Invoke-RestMethod -Uri http://localhost:3000/api/analyze -Method Post -ContentType 'application/json' -Body $body | Out-Null; "200" } catch { $_.Exception.Response.StatusCode.value__ } }
```
- [ ] Too long → `400`. Empty → `400`. The rate-limit loop eventually shows `429`.

**Fallback test (the most important one)**
1. In `.env.local`, change `GEMINI_API_KEY` to `broken`, then restart `npm run dev`.
2. Re-run the happy-path call.
- [ ] You still get a `200` with a valid mood, and the response marks the source as fallback.
- [ ] Restore the real key afterwards.

**Model alias check**
- [ ] The happy path worked with the real key, which confirms `GEMINI_MODEL` is valid. Otherwise check the server terminal for a "model not found" error.

**Key leak check**
```powershell
npm run build
Get-ChildItem .next\static -Recurse -Filter *.js | Select-String -Pattern 'AIza' -List
```
- [ ] Prints **nothing**. Gemini keys start with `AIza`, so a match means the key is exposed.

---

## Phase 3: Timeline + renderer + preview

Open http://localhost:3000 and paste the ABAB poem.

- [ ] Words appear in order, and stressed syllables and emphasis words visibly linger.
- [ ] There are clear pauses at commas, longer ones at full stops, and the longest at the stanza break.
- [ ] Play, pause and scrub all work. Scrubbing back and forth never glitches or leaves ghost text.
- [ ] Scrubbing to the same point twice looks identical. That proves `renderFrame` is pure.
- [ ] Toggling Reel 9:16 ↔ Post 4:5 re-lays out the text, and nothing is cut off at the edges.
- [ ] A very long single line wraps inside the safe area.
- [ ] The final frame holds the full poem for about 2–3 s.

```powershell
npm test -- timeline
```
- [ ] There's a test confirming the same input gives the same timeline (determinism).
- [ ] Total duration grows when speed decreases.

---

## Phase 4: Moods, entrances, rhyme echoes

- [ ] You can cycle through all 6 moods (Tender, Melancholy, Defiant, Joyful, Reverent, Restless), and each one is instantly distinguishable by font, palette and motion.
- [ ] In the ABAB poem, when `floor` lands, `door` pulses in the same accent colour (rhyme echo).
- [ ] The rhyme echo toggle turns this off.
- [ ] The paper grain texture is visible but subtle, and it doesn't flicker frame to frame.
- [ ] With DevTools → Performance → record 5 s of playback, the frame rate holds around 60 fps on your laptop.

---

## Phase 5: Editor UI + share links

- [ ] The landing page loads in the editorial-paper style (off-white, serif, ink-black).
- [ ] Sample poems load and are public domain (pre-1929) or your own originals.
- [ ] The mood, palette, speed and format controls update the preview live.
- [ ] Re-roll emphasis changes which words are emphasised.

**Share link round-trip**
1. Style a poem, then click Copy link.
2. Open it in an **Incognito** window.
- [ ] The poster is identical, with the same poem, mood, palette, speed and format.
- [ ] Opening the link didn't trigger a Gemini call. Check the server terminal: there should be no AI request logged.

3. Corrupt the URL by deleting half the hash.
- [ ] You get a friendly "link is broken" message, not a white screen.

---

## Phase 6: Export

- [ ] The PNG downloads as `stanza-<title>.png`. Right-click → Properties → Details should show **1080×1920** (Reel) or **1080×1350** (Post).
- [ ] The video downloads, plays in VLC or the Windows Media Player, and its duration roughly equals the preview length.
- [ ] The export matches the preview exactly, including the same timing and rhyme echoes.
- [ ] A progress indicator shows during recording, and the UI doesn't freeze.
- [ ] **Instagram check:** look at the file extension. Instagram does not accept `.webm`. If you got `.webm`, ask Claude Code to prefer MP4 in Chrome (`MediaRecorder.isTypeSupported('video/mp4')`) or to add a conversion note.
- [ ] Test in Chrome **and** Edge, and Firefox if you can.

---

## Phase 7: Deploy (Vercel)

- [ ] `GEMINI_API_KEY` and `GEMINI_MODEL` are set in Vercel → Project → Settings → Environment Variables.
- [ ] The live URL works end to end: paste → analyze → preview → export → share link.
- [ ] Run the key-leak check against the live site: DevTools → Sources → search `AIza` should return nothing.
- [ ] On your phone (real device), the layout fits, there's no horizontal scroll, and the preview plays.
- [ ] Every edge-case poem from the top of this file behaves gracefully on the live site.
- [ ] Loading and error states show up properly. Check this with DevTools → Network → throttle to "Slow 4G".

---

## Phase 8: Docs

- [ ] A fresh clone works using only the README:
  ```powershell
  cd $env:TEMP; git clone https://github.com/Dhwanitisshah/stanza; cd stanza
  copy .env.example .env.local   # add key
  npm ci; npm run verify; npm run dev
  ```
- [ ] The README has screenshots, a how-it-works diagram, setup, env vars and known limitations.
- [ ] The AI disclosure section is present and honest.
- [ ] `DEVLOG.md` reads as your own learning story. Rewrite any line you couldn't explain out loud.

---

## Bug log

When something fails, write it here before asking Claude Code to fix it. That makes for a better prompt and a better DEVLOG.

| Date | Phase | What I did | What I expected | What happened | Fixed in commit |
|---|---|---|---|---|---|
| | | | | | |
