// Makes the site's pictures with the REAL app (production build, headless Edge/Chrome), so they are drawn by Stanza's
// own engine and fonts rather than a design tool. Run it again whenever the look changes, and commit the results.
//
//   npm run build && npm run brand
//
// Writes:
//   public/og.jpg                      1200 x 630  the share card for link previews: the lamp poem as a Stanza poster (a JPEG, ~75 KB:
//                                      paper grain makes a PNG ~500 KB, and WhatsApp skips big previews)
//   public/icon-192.png, icon-512.png  the web-manifest icons
//   public/icon-maskable-512.png       the same letter on a full-bleed square with a safe margin (Android masks it)
//   src/app/apple-icon.png             180 x 180   iOS home screen
//   src/app/favicon.ico                16, 32 and 48 px in one file
// src/app/icon.svg is hand-written (a vector for modern browsers) and is not generated here.
//
// The share card holds a generic example, never a visitor's poem: the server cannot see a share link's #hash.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, harness, launchBrowser, openPage, root, startApp } from "./lib/browser.mjs";
import { loadFixtures } from "./lib/fixtures.mjs";

const fixtures = await loadFixtures();

const INK = "#1C1A17";
const PAPER = "#F4EFE6";
const MUTED = "#6B645A";
const ACCENT = "#B23A1E";

/** Runs in the page: draws a picture on a canvas using the page's own loaded fonts and returns it as a PNG data URL. */
const BROWSER_HELPERS = `
  const cssVar = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();
  const family = (name) => cssVar(name).split(",")[0].trim();
  const ready = async (specs) => { await Promise.all(specs.map((s) => document.fonts.load(s, "Stanza Aa"))); };
`;

const ogScript = (posterDataUrl) => `(async () => {
  ${BROWSER_HELPERS}
  const serif = family("--font-instrument-serif");
  const sans = family("--font-geist-sans");
  await ready([\`italic 400 100px \${serif}\`, \`400 40px \${serif}\`, \`500 20px \${sans}\`, \`400 22px \${sans}\`]);

  const W = 1200, H = 630;
  const canvas = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "${PAPER}";
  ctx.fillRect(0, 0, W, H);

  // the poster, from the engine, with a soft shadow
  const poster = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = ${JSON.stringify(posterDataUrl)}; });
  const ph = 534, pw = Math.round(ph * poster.width / poster.height);
  const px = W - 84 - pw, py = (H - ph) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(28,26,23,0.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.drawImage(poster, px, py, pw, ph);
  ctx.restore();

  // the words
  const x = 84;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "${ACCENT}";
  ctx.font = \`500 20px \${sans}\`;
  ctx.letterSpacing = "3px";
  ctx.fillText("YOUR POEM, PERFORMED", x, 150);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "${INK}";
  ctx.font = \`italic 400 168px \${serif}\`;
  ctx.fillText("Stanza", x - 4, 308);

  ctx.font = \`400 46px \${serif}\`;
  ctx.fillText("You wrote the poem.", x, 400);
  ctx.fillText("Stanza gives it a pulse.", x, 456);

  ctx.fillStyle = "${MUTED}";
  ctx.font = \`400 22px \${sans}\`;
  ctx.fillText("Stanza never writes a word. It performs yours.", x, 548);

  return canvas.toDataURL("image/jpeg", 0.9);
})()`;

const iconScript = (size, kind) => `(async () => {
  ${BROWSER_HELPERS}
  const serif = family("--font-instrument-serif");
  await ready([\`italic 400 100px \${serif}\`]);
  const size = ${size};
  const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size });
  const ctx = canvas.getContext("2d");
  const kind = ${JSON.stringify(kind)};
  ctx.fillStyle = "${INK}";
  if (kind === "rounded") { ctx.beginPath(); ctx.roundRect(0, 0, size, size, size * 0.22); ctx.fill(); }
  else ctx.fillRect(0, 0, size, size);
  // the letter fills ~62% of a normal icon, ~46% of a maskable one (Android may crop to the inner 80%)
  const px = size * (kind === "maskable" ? 0.5 : 0.68);
  ctx.font = \`italic 400 \${px}px \${serif}\`;
  ctx.fillStyle = "${PAPER}";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText("S");
  const top = m.actualBoundingBoxAscent, bottom = m.actualBoundingBoxDescent;
  ctx.fillText("S", size / 2, size / 2 + (top - bottom) / 2);
  return canvas.toDataURL("image/png");
})()`;

const toBuffer = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");

/** An .ico that holds PNG images (supported since Windows Vista and by every browser). */
function makeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

let code = 0;
try {
  const url = await startApp({ port: 3180 });
  await launchBrowser(9400);
  const page = await openPage(9400, url, { width: 1440, height: 1000 });
  const app = harness(page);

  // ---- the poster: the lamp poem, Tender, 4:5, finished page
  await app.perform(fixtures.abab);
  await page.waitFor(`!!document.querySelector("canvas")`, "the poster", 30_000);
  await app.useSuggestedTitle();
  await app.setMood("Tender");
  await page.waitFor(`document.querySelector("canvas")?.dataset.mood === "Tender"`, "the Tender poster", 30_000);
  await app.setFormat("post");
  await page.waitFor(`document.querySelector("canvas")?.height === 1350`, "the 4:5 canvas", 30_000);
  await app.settle(400);
  await app.seek(await app.totalMs());
  await app.settle(300);
  const posterPng = await app.canvasPng();
  const posterUrl = `data:image/png;base64,${posterPng.toString("base64")}`;

  const publicDir = join(root, "public");
  const appDir = join(root, "src", "app");
  mkdirSync(publicDir, { recursive: true });

  writeFileSync(join(publicDir, "og.jpg"), toBuffer(await page.evaluate(ogScript(posterUrl))));
  writeFileSync(join(publicDir, "icon-192.png"), toBuffer(await page.evaluate(iconScript(192, "rounded"))));
  writeFileSync(join(publicDir, "icon-512.png"), toBuffer(await page.evaluate(iconScript(512, "rounded"))));
  writeFileSync(join(publicDir, "icon-maskable-512.png"), toBuffer(await page.evaluate(iconScript(512, "maskable"))));
  writeFileSync(join(appDir, "apple-icon.png"), toBuffer(await page.evaluate(iconScript(180, "square"))));
  const icoImages = [];
  for (const size of [16, 32, 48]) icoImages.push({ size, png: toBuffer(await page.evaluate(iconScript(size, "rounded"))) });
  writeFileSync(join(appDir, "favicon.ico"), makeIco(icoImages));

  console.log("Wrote public/og.jpg (1200x630), public/icon-192.png, icon-512.png, icon-maskable-512.png, src/app/apple-icon.png, src/app/favicon.ico");
  page.close();
} catch (error) {
  console.error(error);
  code = 1;
} finally {
  cleanup();
}
process.exit(code);
