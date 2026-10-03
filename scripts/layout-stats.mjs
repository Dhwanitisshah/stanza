// Real-browser layout numbers (font size, pages, wrapped lines) for fixture poems, using the production build.
// Usage: npm run build && npm run layout-stats -- [fixture ...]     (default: abab aabb free-verse)
import { cleanup, harness, launchBrowser, openPage, startApp } from "./lib/browser.mjs";
import { loadFixtures } from "./lib/fixtures.mjs";

const fixtures = await loadFixtures();
const names = process.argv.slice(2).length ? process.argv.slice(2) : ["abab", "aabb", "free-verse"];
for (const name of names) if (!(name in fixtures)) throw new Error(`Unknown fixture "${name}". Known: ${Object.keys(fixtures).join(", ")}`);

const port = 3120;
const debugPort = 9340;
let code = 0;
try {
  const url = await startApp({ port });
  await launchBrowser(debugPort);
  const page = await openPage(debugPort, url);
  const app = harness(page);

  console.log(["fixture".padEnd(12), "format".padEnd(7), "font px".padStart(8), "pages".padStart(6), "lines".padStart(6), "wrapped".padStart(8)].join("  "));
  for (const name of names) {
    for (const format of ["reel", "post"]) {
      await app.setPoem(fixtures[name]);
      await app.setFormat(format);
      await app.analyze();
      await page.waitFor(`(() => { const c = document.querySelector("canvas"); return !!c && c.height === ${format === "reel" ? 1920 : 1350}; })()`, `${name}/${format} canvas`);
      await page.evaluate(`new Promise((r) => setTimeout(r, 200))`);
      const info = await app.canvasInfo();
      console.log([name.padEnd(12), format.padEnd(7), info.fontSize.padStart(8), info.pages.padStart(6), info.lines.padStart(6), info.wrappedLines.padStart(8)].join("  "));
    }
  }
  page.close();
} catch (error) {
  console.error(error);
  code = 1;
} finally {
  cleanup();
}
process.exit(code);
