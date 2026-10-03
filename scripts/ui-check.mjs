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
