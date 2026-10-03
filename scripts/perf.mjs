// Frame-time check using the DEV frame log (the log is compiled out of production builds).
// Scrubs through a fixture so frames from the whole animation are drawn, then reads the average draw time that
// the app logs every 120 frames. Headless Edge uses software rendering, so treat the numbers as an upper bound.
//
//   npm run perf -- [fixture] [mood ...] [--image] [--pattern=grid]
//       default: forty-lines, all six moods. --image puts a (generated) photo behind the poem, darkened 35%;
//       --pattern=<id> adds a background pattern at strength 60. Both are drawn every frame, so they are the heavy case.
import { cleanup, harness, launchBrowser, openPage, sleep, startApp } from "./lib/browser.mjs";
import { loadFixtures } from "./lib/fixtures.mjs";

const MOODS = ["Tender", "Melancholy", "Defiant", "Joyful", "Reverent", "Restless"];
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const name = args[0] ?? "forty-lines";
const moods = args.length > 1 ? args.slice(1) : MOODS;
const withImage = flags.includes("--image");
const pattern = flags.find((f) => f.startsWith("--pattern="))?.slice("--pattern=".length) ?? null;
const SEEKS = 250; // two log lines per mood (every 120 frames)

const fixtures = await loadFixtures();
if (!(name in fixtures)) throw new Error(`Unknown fixture "${name}"`);

let code = 0;
try {
  const url = await startApp({ mode: "dev", port: 3140 });
  await launchBrowser(9360);
  const page = await openPage(9360, url);
  const app = harness(page);

  await app.perform(fixtures[name]);
  await page.waitFor(`!!document.querySelector("canvas")`, "the first poster", 60_000);

  if (withImage) await app.applyStyle({ background: { kind: "image", darken: 35, photo: { width: 4000, height: 3000, type: "image/jpeg", name: "photo.jpg" } } });
  if (pattern) await app.applyStyle({ pattern, patternStrength: 60 });
  const extras = [withImage ? "a 4000 x 3000 photo, darkened 35%" : null, pattern ? `the ${pattern} pattern` : null].filter(Boolean).join(" + ");
  console.log(`fixture: ${name}   (${SEEKS} frames spread across the animation, per mood)${extras ? `   with ${extras}` : ""}\n`);
  console.log("mood".padEnd(12), "avg ms/frame (dev log)".padEnd(26), "pages".padEnd(6), "font px");
  for (const mood of moods) {
    await app.setMood(mood);
    await page.waitFor(`document.querySelector("canvas")?.dataset.mood === ${JSON.stringify(mood)}`, `${mood} poster`, 60_000);
    await app.settle(300);
    const total = await app.totalMs();
    const before = page.consoleLines.length;
    for (let i = 0; i < SEEKS; i++) {
      await app.seek(Math.round((i / (SEEKS - 1)) * total));
      if (i % 25 === 0) await sleep(5);
    }
    await sleep(200);
    const averages = page.consoleLines
      .slice(before)
      .map((line) => /average frame time ([\d.]+) ms/.exec(line.text)?.[1])
      .filter(Boolean)
      .map(Number);
    const info = await app.canvasInfo();
    const worst = averages.length ? Math.max(...averages) : NaN;
    console.log(mood.padEnd(12), (averages.length ? `${worst.toFixed(2)} (of ${averages.map((a) => a.toFixed(2)).join(", ")})` : "no log line").padEnd(26), info.pages.padEnd(6), info.fontSize);
  }
  page.close();
} catch (error) {
  console.error(error);
  code = 1;
} finally {
  cleanup();
}
process.exit(code);
