// Renders a fixture poem in all six moods with the REAL app (production build, headless Edge/Chrome) and saves
// the pixels, so you can look at them side by side.
//
//   npm run build && npm run posters -- <fixture> [--format=reel|post] [--byline="— name"]
//
// Output (gitignored): posters/<fixture>/<Mood>-final.png   the finished poster (the last frame)
//                      posters/<fixture>/<Mood>-mid.png     a moment mid-animation (a rhyme echo landing)
//                      posters/<fixture>/index.html         all of them side by side
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanup, harness, launchBrowser, openPage, root, startApp } from "./lib/browser.mjs";
import { loadFixtures } from "./lib/fixtures.mjs";

const MOODS = ["Tender", "Melancholy", "Defiant", "Joyful", "Reverent", "Restless"];

const args = process.argv.slice(2);
const flag = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const name = args.find((a) => !a.startsWith("--"));
const format = flag("format", "reel");
const byline = flag("byline", "— Dhwanit");

const fixtures = await loadFixtures();
if (!name || !(name in fixtures)) {
  console.error(`Usage: npm run posters -- <fixture> [--format=reel|post] [--byline="— name"]\nFixtures: ${Object.keys(fixtures).join(", ")}`);
  process.exit(1);
}
if (format !== "reel" && format !== "post") throw new Error('--format must be "reel" or "post"');

const outDir = join(root, "posters", name);
mkdirSync(outDir, { recursive: true });

let code = 0;
try {
  const url = await startApp({ port: 3130 });
  await launchBrowser(9350);
  const page = await openPage(9350, url);
  const app = harness(page);

  await app.setPoem(fixtures[name]);
  await app.setByline(byline);
  await app.setFormat(format);
  await app.analyze();
  await page.waitFor(`!!document.querySelector("canvas")`, "the first poster");

  for (const mood of MOODS) {
    await app.setMood(mood);
    await page.waitFor(`document.querySelector("canvas")?.dataset.mood === ${JSON.stringify(mood)}`, `the ${mood} poster (fonts + layout)`, 30_000);
    await app.pause();

    await app.seek((await page.evaluate(`Number(document.querySelector("canvas").dataset.reviewMs)`)));
    await page.evaluate(`new Promise((r) => setTimeout(r, 150))`);
    writeFileSync(join(outDir, `${mood}-mid.png`), await app.canvasPng());

    await app.seek(await app.totalMs());
    await page.evaluate(`new Promise((r) => setTimeout(r, 150))`);
    writeFileSync(join(outDir, `${mood}-final.png`), await app.canvasPng());

    const info = await app.canvasInfo();
    console.log(`${mood.padEnd(11)} ${info.width}x${info.height}  font ${info.fontSize}px  pages ${info.pages}  wrapped lines ${info.wrappedLines}`);
  }

  const cell = (mood, kind) => `<figure><img src="${mood}-${kind}.png" alt="${mood} ${kind}"><figcaption>${mood} ${kind}</figcaption></figure>`;
  writeFileSync(
    join(outDir, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Stanza posters: ${name}</title>
<style>body{margin:16px;font:14px system-ui;background:#888}h1{font-size:16px;color:#fff}.row{display:flex;gap:12px;margin-bottom:12px;overflow-x:auto}
figure{margin:0;flex:0 0 auto}img{height:${format === "reel" ? 560 : 420}px;display:block;box-shadow:0 1px 6px #0006}figcaption{color:#fff;padding:4px 0}</style>
<h1>${name} (${format}): final frames, then mid-animation frames</h1>
<div class="row">${MOODS.map((m) => cell(m, "final")).join("")}</div>
<div class="row">${MOODS.map((m) => cell(m, "mid")).join("")}</div>`,
  );
  page.close();

  // One picture of everything, for a quick look (and later, for the README).
  const contactSheetPage = await openPage(9350, pathToFileURL(join(outDir, "index.html")).href, {
    width: 6 * 330 + 60,
    height: format === "reel" ? 1260 : 960,
    ready: 'document.readyState === "complete" && [...document.images].every((i) => i.complete)',
  });
  writeFileSync(join(outDir, "contact-sheet.png"), await contactSheetPage.screenshot());
  contactSheetPage.close();
  console.log(`\nSaved to posters/${name}/  (contact-sheet.png shows all six; index.html is the same, interactive)`);
} catch (error) {
  console.error(error);
  code = 1;
} finally {
  cleanup();
}
process.exit(code);
