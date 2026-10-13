// Times a real reel export (frame-by-frame H.264 MP4) of the 40-line fixture in each mood, with the production build.
//
//   npm run build && npm run export-time [-- --moods=Tender,Restless] [--runs=1]
//
// Reports, per mood: the length of the reel, the frame count, the wall-clock time from pressing "Export reel" to
// "Your reel is ready", how many times faster than real time that is, and the milliseconds per frame. Wall-clock
// includes everything a visitor waits for (drawing each frame, encoding, writing the file).
import { cleanup, harness, launchBrowser, openPage, root, startApp } from "./lib/browser.mjs";
import { loadFixtures } from "./lib/fixtures.mjs";

const MOODS = ["Tender", "Melancholy", "Defiant", "Joyful", "Reverent", "Restless"];
const args = process.argv.slice(2);
const flag = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const moods = flag("moods", MOODS.join(",")).split(",");
const runs = Number(flag("runs", "1"));
void root;

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

let code = 0;
try {
  const fixtures = await loadFixtures();
  const url = await startApp({ port: 3190 });
  await launchBrowser(9410);
  const page = await openPage(9410, url, { width: 1440, height: 1000 });
  const app = harness(page);
  const dialog = (prop) => `document.querySelector("dialog[open]")?.dataset.${prop}`;
  const click = (text) =>
    page.evaluate(`(() => { const b = [...document.querySelectorAll("dialog[open] button")].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)}) && !x.disabled); if (!b) throw new Error("no button " + ${JSON.stringify(text)}); b.click(); })()`);

  await app.perform(fixtures["forty-lines"]);
  await page.waitFor(`!!document.querySelector("canvas")`, "the poster", 60_000);
  await app.useSuggestedTitle();
  await app.setByline("Dhwanit Shah");

  const rows = [];
  for (const mood of moods) {
    await app.setMood(mood);
    await page.waitFor(`document.querySelector("canvas")?.dataset.mood === ${JSON.stringify(mood)}`, `the ${mood} poster`, 60_000);
    await app.settle(500);
    const totalMs = await app.totalMs();
    const info = await app.canvasInfo();

    const times = [];
    let frames = 0;
    let size = "";
    for (let run = 0; run < runs; run++) {
      await page.waitFor(`[...document.querySelectorAll("header button")].some((b) => b.textContent.trim() === "Export" && !b.disabled)`, "Export to be enabled", 60_000);
      await page.evaluate(`[...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Export").click()`);
      await page.waitFor(`${dialog("phase")} === "idle" && ${dialog("method")} !== "probing"`, "the dialog", 15_000);
      if ((await page.evaluate(dialog("method"))) !== "frames") throw new Error("This browser cannot encode frame by frame; the timing would not mean anything.");
      const started = Date.now();
      await click("Export reel");
      await page.waitFor(`${dialog("phase")} === "done" || ${dialog("phase")} === "error"`, "the reel", 600_000);
      const wall = Date.now() - started;
      if ((await page.evaluate(dialog("phase"))) !== "done") throw new Error(`The ${mood} export failed.`);
      const line = await page.evaluate(`document.querySelector('dialog[open] section[aria-label="Result"] p')?.textContent ?? ""`);
      frames = Number(/(\d+) frames/.exec(line)?.[1] ?? 0);
      size = /([\d.]+ MB)/.exec(line)?.[1] ?? "";
      times.push(wall);
      await page.evaluate(`document.querySelector('dialog[open] button[aria-label="Close"]').click()`);
      await app.settle(300);
    }
    const wall = median(times);
    rows.push({ mood, totalMs, frames, wall, size });
    console.log(
      `${mood.padEnd(11)} reel ${(totalMs / 1000).toFixed(1).padStart(5)} s  ${String(frames).padStart(5)} frames  export ${(wall / 1000).toFixed(1).padStart(5)} s  ${(totalMs / wall).toFixed(2)}x real time  ${(wall / frames).toFixed(1)} ms/frame  ${size}  (${info.pages} pages, ${info.width}x${info.height})`,
    );
  }

  const walls = rows.map((r) => r.wall);
  console.log(`\nfastest ${(Math.min(...walls) / 1000).toFixed(1)} s, median ${(median(walls) / 1000).toFixed(1)} s, slowest ${(Math.max(...walls) / 1000).toFixed(1)} s (${runs} run${runs === 1 ? "" : "s"} per mood)`);
  page.close();
} catch (error) {
  console.error(error);
  code = 1;
} finally {
  cleanup();
}
process.exit(code);
