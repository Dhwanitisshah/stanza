// End-to-end check of the real app (production build, headless Edge/Chrome): share links, the rhythm strip,
// the length control, touch-target sizes and accessible names. Run `npm run build` first.
//   npm run ui-check
import lzString from "lz-string";
import { createHash } from "node:crypto";

const lib = await import("./lib/browser.mjs");
const { cleanup, harness, launchBrowser, openPage, startApp } = lib;

const LAMP = "The lamp burns low beside the door,\nthe kettle hums a quiet tune,\nthe rain has found the wooden floor,\nand somewhere far, a patient moon.";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};
const md5 = (buf) => createHash("md5").update(buf).digest("hex");

let code = 0;
try {
  const url = await startApp({ port: 3160 });
  await launchBrowser(9380);
  const page = await openPage(9380, url, { width: 1440, height: 1000 });
  const app = harness(page);
  const sleep = (ms) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`);
  const waitCanvas = (what) => page.waitFor(`!!document.querySelector("canvas")`, what, 30000);
  const clickTab = (name) => page.evaluate(`document.querySelector('[role=tab][aria-label="${name}"]').click()`);
  const clickBtn = (scope, text) =>
    page.evaluate(`(() => { const s = document.querySelector(${JSON.stringify(scope)}) ?? document; const b = [...s.querySelectorAll("button")].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!b || b.disabled) throw new Error("no enabled button " + ${JSON.stringify(text)}); b.click(); })()`);

  const smallTargets = () => page.evaluate(`(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, input:not([type=range]), textarea, [role=slider], [role=tab], a")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 43.5) out.push((el.getAttribute("aria-label") || el.textContent || el.id || el.tagName).trim().slice(0, 30) + " " + Math.round(r.width) + "x" + Math.round(r.height));
    }
    return out;
  })()`);
  const landingSmall = await smallTargets();
  check("landing: every control is at least 44px tall", landingSmall.length === 0, landingSmall.join("; "));

  // ---- Build a styled poster
  await app.perform(LAMP);
  await waitCanvas("poster");
  await app.useSuggestedTitle();
  await app.setMood("Defiant");
  await page.waitFor(`document.querySelector("canvas")?.dataset.mood === "Defiant"`, "Defiant", 30000);
  await app.setFormat("post");
  await page.waitFor(`document.querySelector("canvas")?.height === 1350`, "post canvas", 30000);
  await app.setByline("Dhwanit Shah");
  await clickTab("Timing");
  await clickBtn('[role=group][aria-label="Length"]', "15 s");
  await sleep(700);
  await page.evaluate(`document.querySelector('button[role=switch][aria-label="Rhyme echoes"]').click()`);
  await sleep(700);
  const before = await app.canvasInfo();
  check("length 15 s lands within 100 ms", Math.abs(Number(before.totalMs) - 15000) <= 100, `total ${before.totalMs} ms`);

  // ---- Share link round trip
  await page.evaluate(`navigator.clipboard.writeText = async (u) => { window.__copied = u; }`);
  await clickBtn("header", "Copy share link");
  await page.waitFor(`!!window.__copied`, "copied link");
  const link = await page.evaluate(`window.__copied`);
  check("share link has #p= payload", /#p=[A-Za-z0-9+\-$]+$/.test(link), `${link.length} chars`);

  const frames = async () => {
    const total = Number(await app.totalMs());
    const out = {};
    for (const [name, t] of [["early", 3000], ["mid", Number(await app.reviewMs())], ["final", total]]) {
      await app.seek(t);
      await sleep(150);
      out[name] = md5(await app.canvasPng());
    }
    return out;
  };
  const original = await frames();

  await page.navigate("about:blank", "true");
  await page.navigate(link);
  await waitCanvas("poster from link");
  await sleep(800);
  const after = await app.canvasInfo();
  const restored = await frames();
  check("link opens the editor with no AI call needed (source: restored)", await page.evaluate(`document.body.innerText.includes("Restored from a share link")`));
  check("link restores mood, format and length", after.mood === before.mood && after.height === before.height && after.totalMs === before.totalMs, `${after.mood} ${after.height} ${after.totalMs}`);
  check("link restores the EXACT poster (early, mid and final frames identical pixels)", original.early === restored.early && original.mid === restored.mid && original.final === restored.final);
  const restoredUi = await page.evaluate(`({ title: document.querySelector("#editor-title").value, poem: document.querySelector("#editor-poem").value.slice(0, 20) })`);
  check("link restores the title and poem text", restoredUi.title === "A Patient Moon" && restoredUi.poem.startsWith("The lamp burns low"), JSON.stringify(restoredUi));

  // ---- Broken and old links
  const payload = link.split("#p=")[1];
  await page.navigate("about:blank", "true");
  await page.navigate(`${url}/#p=${payload.slice(0, Math.floor(payload.length / 2))}`);
  await page.waitFor(`!!document.querySelector("#landing-poem")`, "landing for a broken link", 15000);
  const banner = await page.evaluate(`document.querySelector('[role=status]')?.textContent ?? ""`);
  check("broken link: friendly message and the landing page (no white screen)", /damaged|couldn't open/i.test(banner), banner.slice(0, 80));

  const { compressToEncodedURIComponent } = lzString;
  const old = compressToEncodedURIComponent(JSON.stringify({ v: 0, p: "an old poem about rain" }));
  await page.navigate("about:blank", "true");
  await page.navigate(`${url}/#p=${old}`);
  await page.waitFor(`!!document.querySelector("#editor-poem")`, "editor for an old link", 20000);
  const oldUi = await page.evaluate(`({ poem: document.querySelector("#editor-poem").value, notice: document.querySelector('[role=status]')?.textContent ?? "" })`);
  check("old-version link: editor opens with the recovered poem and says why", oldUi.poem === "an old poem about rain" && /different version/i.test(oldUi.notice), oldUi.notice.slice(0, 70));

  // ---- Rhythm strip (fresh poster)
  await page.navigate("about:blank", "true");
  await page.navigate(url);
  await app.perform(LAMP);
  await waitCanvas("poster");
  await sleep(500);
  await page.evaluate(`document.querySelector("canvas").dispatchEvent(new CustomEvent("stanza:seek", { detail: 0 }))`);
  const now = () => page.evaluate(`Number(document.querySelector('[role=slider]').getAttribute("aria-valuenow"))`);
  const key = async (k) => {
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k });
    await sleep(120);
  };
  await page.evaluate(`document.querySelector('[role=slider]').focus()`);
  const t0 = await now();
  await key("ArrowRight");
  const t1 = await now();
  await key("ArrowRight");
  const t2 = await now();
  await key("ArrowLeft");
  const t3 = await now();
  check("rhythm strip: arrow keys step word by word (forward, forward, back)", t1 > t0 && t2 > t1 && t3 === t1, `${t0} -> ${t1} -> ${t2} -> ${t3}`);
  await key("End");
  const tEnd = await now();
  await key("Home");
  const tHome = await now();
  check("rhythm strip: End and Home jump to the last and first word", tEnd > t2 && tHome === t1 && tHome < t2, `${tHome} .. ${tEnd}`);
  const valueText = await page.evaluate(`document.querySelector('[role=slider]').getAttribute("aria-valuetext")`);
  check("rhythm strip: screen-reader text names the word", /Word \d+ of 26/.test(valueText), valueText);

  // click a bar: pick the 10th bar by position
  const clickTarget = await page.evaluate(`(() => {
    const strip = document.querySelector('[role=slider]');
    const bars = [...strip.querySelectorAll("span[aria-hidden]")].filter((s) => s.style.left);
    const bar = bars[9];
    const r = bar.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: parseFloat(bar.style.left) };
  })()`);
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: clickTarget.x, y: clickTarget.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: clickTarget.x, y: clickTarget.y, button: "left", clickCount: 1 });
  await sleep(150);
  const tClick = await now();
  const total = Number(await app.totalMs());
  check("rhythm strip: clicking the 10th bar seeks to its landing", Math.abs(tClick / total - clickTarget.left / 100) < 0.002, `${tClick} ms (bar at ${(clickTarget.left / 100 * total).toFixed(0)} ms)`);

  // ---- Length control: presets
  await clickTab("Timing");
  const presetState = await page.evaluate(`[...document.querySelectorAll('[role=group][aria-label="Length"] button')].map((b) => b.textContent.trim() + (b.disabled ? " (off)" : ""))`);
  console.log("      presets:", presetState.join(" | "));
  for (const [label, target] of [["15 s", 15000], ["30 s", 30000], ["60 s", 60000]]) {
    await clickBtn('[role=group][aria-label="Length"]', label);
    await sleep(900);
    const info = await app.canvasInfo();
    check(`length ${label}: total is ${target} ms (+-100)`, Math.abs(Number(info.totalMs) - target) <= 100, `${info.totalMs}`);
  }
  const status = await page.evaluate(`document.querySelector('[role=status]')?.textContent ?? ""`);
  check("length 60 s explains the extended hold", /holds .* longer/i.test(status), status.slice(0, 90));
  const seven = await page.evaluate(`[...document.querySelectorAll('[role=group][aria-label="Length"] button')].find((b) => b.textContent.trim() === "7 s")?.disabled`);
  check("length 7 s is switched off for this poem (shorter than readable)", seven === true);

  // =====================================================================================================
  // Phase 5b: backgrounds, patterns, colours, important words, photos, share links v2, live editing
  // =====================================================================================================
  const finalHash = async () => {
    await app.seek(Number(await app.totalMs()));
    await sleep(250);
    return md5(await app.canvasPng());
  };
  const fraction = () =>
    page.evaluate(`(() => { const s = document.querySelector('[role=slider]'); return Number(s.getAttribute("aria-valuenow")) / Number(s.getAttribute("aria-valuemax")); })()`);
  const freshEditor = async (poem = LAMP) => {
    await page.navigate("about:blank", "true");
    await page.navigate(url);
    await app.perform(poem);
    await waitCanvas("poster");
    await sleep(700);
  };
  const waitForMood = (mood) => page.waitFor(`document.querySelector("canvas")?.dataset.mood === "${mood}"`, mood, 30000);
  const alertText = () => page.evaluate(`[...document.querySelectorAll("[role=alert]")].map((e) => e.textContent).join(" | ")`);

  // ---- The playhead keeps its place across style changes (as a fraction, if the length changes)
  await freshEditor();
  await page.evaluate(`document.querySelector("canvas").dispatchEvent(new CustomEvent("stanza:seek", { detail: Math.round(Number(document.querySelector("canvas").dataset.totalMs) * 0.4) }))`);
  await sleep(200);
  const f0 = await fraction();
  const total0 = Number((await app.canvasInfo()).totalMs);
  await app.setBackgroundColour("#2E3A4A");
  await sleep(900);
  check("playhead stays put when the background colour changes", Math.abs((await fraction()) - f0) < 0.005, f0.toFixed(3) + " -> " + (await fraction()).toFixed(3));
  await app.setMood("Restless");
  await waitForMood("Restless");
  await sleep(900);
  const total1 = Number((await app.canvasInfo()).totalMs);
  check("playhead stays put when the mood changes (and the length changes with it)", total1 !== total0 && Math.abs((await fraction()) - f0) < 0.005, `length ${total0} -> ${total1}, fraction ${(await fraction()).toFixed(3)}`);
  await clickTab("Timing");
  await clickBtn('[role=group][aria-label="Length"]', "30 s");
  await sleep(900);
  check("playhead stays put when the length changes", Math.abs((await fraction()) - f0) < 0.005, (await fraction()).toFixed(3));

  // ---- Patterns
  await freshEditor();
  const bare = await finalHash();
  const hashes = {};
  for (const id of ["ruled", "notebook", "grid", "dots", "hatch", "frame", "arch"]) {
    await app.setPattern(id);
    await sleep(500);
    hashes[id] = await finalHash();
  }
  check("every pattern changes the poster, and no two look the same", Object.values(hashes).every((h) => h !== bare) && new Set(Object.values(hashes)).size === 7);
  await app.setPattern("grid");
  await sleep(400);
  const grid60 = await finalHash();
  await app.setPatternStrength(0);
  await sleep(500);
  check("pattern strength 0 looks exactly like no pattern", (await finalHash()) === bare);
  await app.setPatternStrength(100);
  await sleep(500);
  check("pattern strength changes how strong it is", (await finalHash()) !== grid60);
  await app.setPattern("none");
  await sleep(500);
  check("pattern None goes back to the bare poster", (await finalHash()) === bare);

  // ---- Photo backgrounds
  await freshEditor();
  const paper = await finalHash();
  const jpg = await app.makePhotoFile({ width: 1600, height: 1000, type: "image/jpeg", name: "sunset.jpg" });
  await app.uploadImage(jpg);
  await page.waitFor('!!document.querySelector("#darken")', "the JPG to load", 30000);
  await sleep(700);
  const withJpg = await finalHash();
  check("a JPG becomes the background", withJpg !== paper);
  await app.setDarken(80);
  await sleep(600);
  const darkest = await finalHash();
  await app.setDarken(0);
  await sleep(600);
  const undarkened = await finalHash();
  check("darkening changes the look, from 0 to 80 percent", new Set([darkest, undarkened, withJpg]).size === 3);

  const png = await app.makePhotoFile({ width: 1200, height: 1800, type: "image/png", name: "tall.png" });
  await app.uploadImage(png);
  await sleep(1200);
  const withPng = await finalHash();
  check("a PNG (tall) replaces the JPG", withPng !== undarkened && (await alertText()) === "", await alertText());

  const startedAt = Date.now();
  const huge = await app.makePhotoFile({ width: 6000, height: 4000, type: "image/jpeg", name: "huge.jpg" });
  await app.uploadImage(huge);
  await page.waitFor(`document.querySelector("canvas") && !document.body.innerText.includes("Opening...")`, "the huge photo", 60000);
  await sleep(1000);
  const hugeMs = Date.now() - startedAt;
  const hugeInfo = await app.canvasInfo();
  check("a huge 6000 x 4000 photo opens (downscaled), with no error", (await alertText()) === "" && Number(hugeInfo.height) === 1920, `${hugeMs} ms`);
  check("the huge photo opens in a reasonable time", hugeMs < 30000, `${hugeMs} ms`);

  const beforeBad = await finalHash();
  await app.uploadImage(await app.makeFakeFile("IMG_0001.HEIC", "heic bytes"));
  await sleep(500);
  const heic = await alertText();
  check("a HEIC gets a friendly message that says what to do", /HEIC/.test(heic) && /JPG/.test(heic), heic.slice(0, 90));
  await app.uploadImage(await app.makeFakeFile("poem.txt", "just words"));
  await sleep(400);
  check("a text file is turned away politely", /doesn't look like an image/.test(await alertText()), (await alertText()).slice(0, 80));
  await app.uploadImage(await app.makeFakeFile("broken.jpg", "this is not a real jpeg"));
  await sleep(700);
  check("a broken JPG is turned away politely", /supported|couldn't be opened/.test(await alertText()), (await alertText()).slice(0, 80));
  check("a failed upload leaves the poster as it was", (await finalHash()) === beforeBad);

  await clickBtn("[role=tabpanel]", "Remove");
  await sleep(700);
  check("removing the photo goes back to the mood's paper, exactly", (await finalHash()) === paper);

  // ---- A photo is never put in a share link
  await app.uploadImage(jpg);
  await page.waitFor('!!document.querySelector("#darken")', "the JPG again", 30000);
  await sleep(600);
  await page.evaluate("navigator.clipboard.writeText = async (u) => { window.__copied = u; }");
  await clickBtn("header", "Copy share link");
  await page.waitFor("!!window.__copied", "the link");
  const photoLink = await page.evaluate("window.__copied");
  const toastText = await page.evaluate(`document.querySelector("[aria-live=polite]")?.textContent ?? ""`);
  check("copying a link with a photo explains that the photo stays in the browser", /photo/i.test(toastText), toastText.slice(0, 80));
  check("the link with a photo is small (no pixels in it)", photoLink.length < 700, `${photoLink.length} chars`);
  await page.navigate("about:blank", "true");
  await page.navigate(photoLink);
  await waitCanvas("the poster from the link");
  await sleep(900);
  const linkNotice = await page.evaluate(`document.querySelector('[role=status]')?.textContent ?? ""`);
  check("opening it says the photo could not come along, in one line", /photo/i.test(linkNotice) && linkNotice.length < 240, linkNotice.slice(0, 110));
  check("...and opens on the mood's paper", (await finalHash()) === paper);

  // ---- Line colours and the hard-to-read warning
  await freshEditor();
  const plain = await finalHash();
  await app.setLineColour(1, "#2F5D8A");
  await sleep(700);
  check("a line colour changes the poster", (await finalHash()) !== plain);
  check("a readable line colour shows no warning", !(await page.evaluate(`document.body.innerText.includes("Hard to read")`)));
  await app.setLineColour(1, "#F6F0E4");
  await sleep(500);
  check("a line colour that is almost the paper colour warns that it is hard to read", await page.evaluate(`document.body.innerText.includes("Hard to read")`));
  await app.setLineColour(1, "#1C1A17");
  await sleep(400);
  check("...and the warning goes away when it is readable again", !(await page.evaluate(`document.body.innerText.includes("Hard to read")`)));
  await clickBtn("[role=tabpanel]", "Default");
  await sleep(600);
  check("'Default' puts the line back to normal", (await finalHash()) === plain);

  // ---- Important words and the emphasis colour
  await freshEditor();
  const aiMarked = await page.evaluate(`(async () => { document.querySelector('[role=tab][aria-label="Text"]').click(); await new Promise((r) => setTimeout(r, 200)); return document.querySelectorAll('[role=group][aria-label="Important words"] button[aria-pressed="true"]').length; })()`);
  const baseLength = Number((await app.canvasInfo()).totalMs);
  const plain0 = await finalHash();
  const beat = 240; // Tender
  await app.setImportantWords(["lamp", "kettle", "rain"]);
  await sleep(800);
  const marked = Number((await app.canvasInfo()).totalMs);
  const expected = baseLength + (3 - aiMarked) * Math.round(1.5 * beat);
  check("marking important words changes the length: each holds a beat and a half longer", Math.abs(marked - expected) <= 2 && marked !== baseLength, `AI marked ${aiMarked}; ${baseLength} -> ${marked} (expected ${expected})`);
  const markedHash = await finalHash();
  await app.setEmphasisColour("#2F5D8A");
  await sleep(700);
  check("an emphasis colour changes the poster", (await finalHash()) !== markedHash);
  await clickBtn("[role=tabpanel]", "Let Stanza choose");
  await sleep(800);
  check("'Let Stanza choose' restores Stanza's pick and the default colour (length and look)", Number((await app.canvasInfo()).totalMs) === baseLength && (await finalHash()) === plain0);

  // ---- Reset styling
  await freshEditor();
  const clean = await finalHash();
  await app.setBackgroundColour("#C9D3C3");
  await app.setPattern("dots");
  await app.setLineColour(0, "#8B1A1A");
  await app.setImportantWords(["moon"]);
  await app.setMood("Reverent");
  await waitForMood("Reverent");
  await sleep(800);
  check("styling changes the poster a lot", (await finalHash()) !== clean);
  await app.resetStyling();
  await waitForMood("Tender");
  await sleep(900);
  check("Reset styling puts everything back: look, pattern, colours, marks and mood", (await finalHash()) === clean && Number((await app.canvasInfo()).totalMs) === baseLength);
  const stillThere = await page.evaluate(`document.querySelector("#editor-title") !== null`);
  check("Reset styling leaves the poem and settings alone", stillThere);

  // ---- A version 1 link still opens
  const v1 = compressToEncodedURIComponent(JSON.stringify({ v: 1, p: "hello there\nhello world", t: "", tp: "above", b: "", m: "Joyful", pv: 2, f: "post", l: null, e: 1, em: [] }));
  await page.navigate("about:blank", "true");
  await page.navigate(`${url}/#p=${v1}`);
  await page.waitFor('!!document.querySelector("#editor-poem")', "the editor for a v1 link", 20000);
  await waitCanvas("the v1 poster");
  await sleep(600);
  const v1Info = await app.canvasInfo();
  const v1Banner = await page.evaluate(`document.body.innerText.toLowerCase().includes("damaged") || document.body.innerText.includes("different version")`);
  check("a version 1 link opens normally (Joyful, Post, no complaints)", v1Info.mood === "Joyful" && Number(v1Info.height) === 1350 && !v1Banner, JSON.stringify({ mood: v1Info.mood, height: v1Info.height, v1Banner }));

  // ---- Editing the poem updates everything after a pause (no AI call, no button)
  await freshEditor();
  const statValue = (label) =>
    page.evaluate(`(() => { const dt = [...document.querySelectorAll("dt")].find((d) => d.textContent.trim() === ${JSON.stringify(label)}); return dt ? Number(dt.nextElementSibling.textContent) : -1; })()`);
  const wordsBefore = await statValue("Words");
  await page.evaluate(`(() => {
    const el = document.querySelector("#editor-poem");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, el.value + " tonight");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await sleep(300);
  const tooSoon = await statValue("Words");
  await sleep(1800);
  const settled = await statValue("Words");
  check("editing the poem waits for a pause before re-reading it", tooSoon === wordsBefore, `${wordsBefore} then ${tooSoon} after 0.3 s`);
  check("...then re-reads it by itself (26 -> 27 words, no button pressed)", settled === wordsBefore + 1, `${wordsBefore} -> ${settled}`);

  // ---- Touch targets on the new tabs
  await clickTab("Background");
  await sleep(300);
  const bgSmall = await smallTargets();
  check("Background tab: every control is at least 44px tall", bgSmall.length === 0, bgSmall.join("; "));
  await clickTab("Text");
  await sleep(300);
  const textSmall = await smallTargets();
  check("Text tab: every control (chips, colour fields, links) is at least 44px tall", textSmall.length === 0, textSmall.join("; "));

  // ---- Touch targets and labels
  const small = await page.evaluate(`(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, input:not([type=range]), textarea, [role=slider], [role=tab], a")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 43.5) out.push((el.getAttribute("aria-label") || el.textContent || el.id || el.tagName).trim().slice(0, 30) + " " + Math.round(r.width) + "x" + Math.round(r.height));
    }
    return out;
  })()`);
  check("every control is at least 44px tall", small.length === 0, small.join("; "));
  const unlabeled = await page.evaluate(`[...document.querySelectorAll("button, input, textarea, select")].filter((el) => !(el.getAttribute("aria-label") || el.textContent.trim() || el.labels?.length || el.getAttribute("aria-labelledby"))).length`);
  check("every button and field has a name", unlabeled === 0, String(unlabeled));
  const consoleErrors = page.consoleLines.filter((l) => l.type === "error" || l.type === "exception");
  check("no console errors", consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));

  page.close();
} catch (error) {
  console.error(error);
  code = 1;
} finally {
  cleanup();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(code || (results.every(Boolean) ? 0 : 1));
