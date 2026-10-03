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

Automatic first (a real browser against the production build; it checks share links, the rhythm strip, the length
control, touch-target sizes and accessible names):
```powershell
npm run build
npm run ui-check      # expect: 21/21 checks passed
```

Then by hand, with `npm run dev` at http://localhost:3000:

**Landing page**
- [ ] It looks like `design/landing.png`: headline, optional title, poem box, "Perform it", the two samples, "How Stanza reads a poem".
- [ ] "The Lamp" and "A Poison Tree" fill the poem box. "Perform it" with an empty box shows a friendly message, not a blank editor.
- [ ] Pasting 41+ lines or 2,001+ characters shows the limit message on the landing page itself.

**Editor layout** (compare with `design/editor.png`)
- [ ] Left: title, poem, "Read it again", Stanza's reading, What Stanza heard (rhyme letters, scheme, lines, words, syllables). Centre: poster + transport. Right: Mood | Text | Background | Timing, with the export buttons pinned under them.
- [ ] The title is empty until you set one: with a suggestion available you see "Suggested: A Patient Moon" and a "Use it" button. The poster shows no title until you press it or type one.
- [ ] Mood tab: six cards with an "Aa" swatch in each mood's own font and colours; the AI's pick is labelled "Stanza's read". Clicking a card restyles the poster. The three palette dots change the colours.
- [ ] Text tab: title placement (Above poem / In footer / Hidden) moves the title on the poster; the byline appears small in the footer with a dash. Line colours and Important words are visible but marked "Coming next".
- [ ] Background tab is visible and marked "Coming next". Nothing in it changes the poster yet.
- [ ] "Read it again" after editing the poem updates the reading, the rhyme letters and the poster.

**Rhythm strip** (new)
- [ ] One bar per word. Tall black = stressed, short beige = unstressed, red = emphasis, empty space = rests (commas, line ends, stanza breaks are visibly wider gaps).
- [ ] Bars up to the playhead are solid; later bars are faded. The red playhead line moves while it plays.
- [ ] Click a bar: the poster jumps to the moment that word lands, and that word is the last one showing. Click in a gap: it jumps to the nearest word.
- [ ] Drag across the strip: the poster scrubs. Scrub to the same bar twice: the frame is identical.
- [ ] Keyboard: Tab to the strip (a focus ring appears), then Right/Left arrows step one word at a time, Home/End go to the first and last word. A screen reader says e.g. "Word 5 of 26, quiet, 0:07.4".
- [ ] Space plays and pauses (but not while typing in a box).

**Timing tab: format, length, echoes** (new)
- [ ] Reel/Post toggles the canvas between 1080 x 1920 and 1080 x 1350 and re-lays out the poem.
- [ ] Auto plays at the natural pace; the note under the buttons says so and gives the duration.
- [ ] 15 s, 30 s and 60 s: the time readout next to the play button ends within 0.1 s of the chosen length.
- [ ] 60 s on a short poem keeps the slowest readable pace (0.5x) and says the finished poster holds longer; the poem itself does not crawl.
- [ ] Any length shorter than the poem can be read is greyed out (7 s for the ABAB poem), with a note giving the shortest readable length. The Custom slider cannot go below it.
- [ ] Changing mood, title or format updates the shortest readable length and re-checks which presets are available.
- [ ] Rhyme echoes switch: off removes the accent pulses on rhyming words; on brings them back.

**Share link round-trip**
1. Style a poem (mood, palette, title above, byline, Post, 30 s, echoes off), then click Copy share link.
2. Open it in an **Incognito** window.
- [ ] The poster is identical: same poem, title, placement, byline, mood, palette, format, length and echo setting. Scrub to the same moments in both windows and compare.
- [ ] The reading line says "Restored from a share link", and the server terminal shows an analyze request with source=skipped (no Gemini call).
- [ ] Edit the link: delete half of the part after `#p=`. You get a friendly "link looks damaged" message on the landing page, not a white screen.
- [ ] A link from an older version (or with an unknown version) opens the editor with your poem and explains that the settings could not be restored.

**Mobile** (compare with `design/mobile.png`; use DevTools device mode at 360 and 390 wide, or a real phone)
- [ ] No horizontal scrolling at 360 px, on the landing page and in the editor.
- [ ] Order is: poster, transport, rhythm strip, then tabs (Poem | Mood | Text | Backdrop | Timing), with a sticky Export / Share bar at the bottom. The tabs are visible without scrolling on a 390 x 844 screen.
- [ ] The Poem tab holds the title, the poem box and Stanza's reading.

**Accessibility**
- [ ] Tab through the whole editor with the keyboard: every control gets a visible accent-coloured focus ring.
- [ ] Mood cards, palette dots, title placement, length presets, format and Loop report their on/off state (aria-pressed); tabs report aria-selected; the echoes switch is a switch.
- [ ] Every control is at least 44 px tall (`npm run ui-check` verifies this).
- [ ] With "reduce motion" turned on in the operating system, opening a poem shows the finished poster and plays only when you press Play.

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
