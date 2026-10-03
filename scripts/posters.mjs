// Renders a fixture poem with the REAL app (production build, headless Edge/Chrome) and saves the pixels,
// so you can look at them side by side.
//
//   npm run build && npm run posters -- <fixture> [--format=reel|post] [--byline="name"] [--title=none]
//       all six moods: posters/<fixture>/<Mood>-final.png, <Mood>-mid.png, index.html, contact-sheet.png
//
//   npm run posters -- <fixture> --styles=tests/fixtures/styles/backgrounds.json
//       one poster per style in the JSON file (backgrounds, patterns, colours, a photo, important words):
//       posters/<fixture>/styles/<name>.png and styles-sheet.png, comparable to design/backgrounds.png
//
// A style is { name, note, mood, titlePlacement, background: {kind, colour | darken, photo}, pattern, patternStrength,
//              lineColours: {"0": "#..."}, important: ["word"], emphasisColour }. Everything is optional.
// Output goes to the gitignored posters/ folder.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanup, harness, launchBrowser, openPage, root, startApp } from "./lib/browser.mjs";
import { loadFixtures } from "./lib/fixtures.mjs";

const MOODS = ["Tender", "Melancholy", "Defiant", "Joyful", "Reverent", "Restless"];

const args = process.argv.slice(2);
const flag = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const name = args.find((a) => !a.startsWith("--"));
const format = flag("format", "reel");
const byline = flag("byline", "Dhwanit Shah");
const title = flag("title", "suggested"); // "suggested" accepts Stanza's suggestion; "none" shows no title
const stylesFile = flag("styles", null);

const fixtures = await loadFixtures();
if (!name || !(name in fixtures)) {
  console.error(`Usage: npm run posters -- <fixture> [--format=reel|post] [--byline="name"] [--title=none] [--styles=file.json]\nFixtures: ${Object.keys(fixtures).join(", ")}`);
  process.exit(1);
}
if (format !== "reel" && format !== "post") throw new Error('--format must be "reel" or "post"');
const styles = stylesFile ? JSON.parse(readFileSync(resolve(root, stylesFile), "utf8")) : null;

const outDir = join(root, "posters", name);
mkdirSync(outDir, { recursive: true });

/** Lays images out side by side in an HTML page, screenshots it, and returns where the files are. */
async function writeSheet({ dir, file, heading, rows, imageHeight }) {
  const cell = (item) => `<figure><img src="${item.src}" alt="${item.caption}"><figcaption><strong>${item.caption}</strong>${item.note ? `<br><span>${item.note}</span>` : ""}</figcaption></figure>`;
  const html = `<!doctype html><meta charset="utf-8"><title>${heading}</title>
<style>body{margin:16px;font:14px system-ui;background:#f1ece2;color:#1c1a17}h1{font:400 28px Georgia,serif;margin:0 0 12px}.row{display:flex;gap:14px;margin-bottom:14px}
figure{margin:0;flex:0 0 auto;width:${Math.round(imageHeight * (1080 / (format === "reel" ? 1920 : 1350)))}px}img{height:${imageHeight}px;display:block;box-shadow:0 2px 10px #0004}figcaption{padding:6px 0;line-height:1.35}figcaption span{color:#6b645a;font-size:12px}</style>
<h1>${heading}</h1>${rows.map((row) => `<div class="row">${row.map(cell).join("")}</div>`).join("")}`;
  writeFileSync(join(dir, `${file}.html`), html);
  return html;
}

let code = 0;
try {
  const url = await startApp({ port: 3130 });
  await launchBrowser(9350);

  if (styles) {
    // ---- one poster per style
    const stylesDir = join(outDir, "styles");
    mkdirSync(stylesDir, { recursive: true });
    const page = await openPage(9350, url);
    const app = harness(page);
    const items = [];
    for (const style of styles) {
      await page.navigate(url);
      await app.perform(fixtures[name]);
      await page.waitFor(`!!document.querySelector("canvas")`, "the poster", 30_000);
      if (title !== "none") await app.useSuggestedTitle();
      if (!style.titlePlacement) await app.setTitlePlacement("Above poem");
      await app.setByline(byline);
      if (format === "post") await app.setFormat("post");
      await app.applyStyle(style);
      await app.settle(500);
      await app.seek(await app.totalMs());
      await app.settle(200);
      const file = `${style.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      writeFileSync(join(stylesDir, file), await app.canvasPng());
      const info = await app.canvasInfo();
      console.log(`${style.name.padEnd(14)} ${info.width}x${info.height}  font ${info.fontSize}px  mood ${info.mood}`);
      items.push({ src: `${file}`, caption: style.name, note: style.note });
    }
    page.close();

    await writeSheet({ dir: stylesDir, file: "index", heading: `Backgrounds, patterns and colour: ${name} (${format})`, rows: [items], imageHeight: 520 });
    const sheetPage = await openPage(9350, pathToFileURL(join(stylesDir, "index.html")).href, {
      width: items.length * 300 + 60,
      height: 700,
      ready: 'document.readyState === "complete" && [...document.images].every((i) => i.complete)',
    });
    writeFileSync(join(outDir, "styles-sheet.png"), await sheetPage.screenshot());
    sheetPage.close();
    console.log(`\nSaved to posters/${name}/styles/ and posters/${name}/styles-sheet.png`);
  } else {
    // ---- all six moods
    const page = await openPage(9350, url);
    const app = harness(page);

    await app.perform(fixtures[name]);
    await page.waitFor(`!!document.querySelector("canvas")`, "the first poster", 30_000);
    if (title !== "none") await app.useSuggestedTitle(); // the poster shows a title only once the user accepts one
    await app.setByline(byline);
    if (format === "post") await app.setFormat("post");

    for (const mood of MOODS) {
      await app.setMood(mood);
      await page.waitFor(`document.querySelector("canvas")?.dataset.mood === ${JSON.stringify(mood)}`, `the ${mood} poster (fonts + layout)`, 30_000);
      await app.settle(300);

      await app.seek(await app.reviewMs());
      await page.evaluate(`new Promise((r) => setTimeout(r, 150))`);
      writeFileSync(join(outDir, `${mood}-mid.png`), await app.canvasPng());

      await app.seek(await app.totalMs());
      await page.evaluate(`new Promise((r) => setTimeout(r, 150))`);
      writeFileSync(join(outDir, `${mood}-final.png`), await app.canvasPng());

      const info = await app.canvasInfo();
      console.log(`${mood.padEnd(11)} ${info.width}x${info.height}  font ${info.fontSize}px  pages ${info.pages}  wrapped lines ${info.wrappedLines}`);
    }
    page.close();

    await writeSheet({
      dir: outDir,
      file: "index",
      heading: `${name} (${format}): final frames, then mid-animation frames`,
      rows: [MOODS.map((m) => ({ src: `${m}-final.png`, caption: `${m} final` })), MOODS.map((m) => ({ src: `${m}-mid.png`, caption: `${m} mid` }))],
      imageHeight: format === "reel" ? 560 : 420,
    });
    const sheetPage = await openPage(9350, pathToFileURL(join(outDir, "index.html")).href, {
      width: 6 * 330 + 60,
      height: format === "reel" ? 1260 : 960,
      ready: 'document.readyState === "complete" && [...document.images].every((i) => i.complete)',
    });
    writeFileSync(join(outDir, "contact-sheet.png"), await sheetPage.screenshot());
    sheetPage.close();
    console.log(`\nSaved to posters/${name}/  (contact-sheet.png shows all six; index.html is the same, interactive)`);
  }
} catch (error) {
  console.error(error);
  code = 1;
} finally {
  cleanup();
}
process.exit(code);
