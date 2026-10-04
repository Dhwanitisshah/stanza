// End-to-end check of the export, in headless Edge/Chrome against the PRODUCTION build (npm run build first).
//
//   npm run export-check
//
// What it does, with the real app and real buttons:
//   1. opens the ABAB poem, accepts the suggested title, adds a byline;
//   2. starts a reel export and cancels it part-way, then checks the dialog recovered;
//   3. exports the reel for real and saves it through the browser's download;
//   4. parses the MP4 (Mediabunny): avc1, 1080 x 1920, duration within one frame of the poem, 30 fps, frame count,
//      no audio, index at the front (fast start), a key frame every 2 s;
//   5. decodes frames back with VideoDecoder and compares them with what the preview draws at the same times (PSNR);
//   6. exports the PNG (must be 1080 x 1920 and IDENTICAL to the final frame, since PNG is lossless) and the JPEG;
//   7. reports how long encoding took against the length of the reel.
//
// Why PSNR 30 dB: see PSNR_FLOOR below. Exit code 1 if any check fails.
import { createServer } from "node:http";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createVite } from "vite";
import { cleanup, harness, launchBrowser, openPage, root, sleep, startApp } from "./lib/browser.mjs";
import { loadFixtures } from "./lib/fixtures.mjs";
import { comparePixels } from "./lib/pixels.mjs";

const APP_PORT = 3150;
const FILE_PORT = 3151;
const DEBUG_PORT = 9370;
const FPS = 30;
const W = 1080;
const H = 1920;

/**
 * Decoded frames are compared with what the preview draws at the same time. H.264 is lossy, and a paper poster is a hard case:
 * film grain is pure noise, which encoders smooth away at 8 Mbps, and 4:2:0 chroma blurs coloured edges. So the frames can
 * never be identical. 30 dB is the usual line between "visibly degraded" and "good" for video (30-40 dB is typical for good
 * H.264). The frames must ALSO match their own moment better than any other sampled moment, by at least this margin:
 * that is what proves the video holds the right frame at the right time, not just a similar-looking one.
 */
const PSNR_FLOOR = 30;
const DISCRIMINATION_MARGIN_DB = 3;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `   ${detail}` : ""}`);
}

// ---- loads frameTimes.ts (the code under test) through a throwaway Vite server
async function loadFrameTimes() {
  const vite = await createVite({
    root,
    configFile: false,
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  });
  try {
    return await vite.ssrLoadModule("/src/lib/export/frameTimes.ts");
  } finally {
    await vite.close();
  }
}

// ---- a tiny file server, so the page can fetch the exported files (and Mediabunny) without huge DevTools messages
const served = new Map();
const fileServer = createServer((request, response) => {
  const entry = served.get((request.url ?? "").split("?")[0]);
  if (!entry) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": entry.type, "access-control-allow-origin": "*" });
  response.end(readFileSync(entry.file));
});

const downloads = mkdtempSync(join(tmpdir(), "stanza-downloads-"));
process.on("exit", () => {
  try {
    rmSync(downloads, { recursive: true, force: true });
  } catch {
    /* temp folder: the OS cleans it up */
  }
});

async function waitForDownload(pattern, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const found = readdirSync(downloads).find((name) => pattern.test(name) && !/\.(crdownload|tmp)$/i.test(name));
    if (found) {
      const path = join(downloads, found);
      const size = statSync(path).size;
      await sleep(300);
      if (statSync(path).size === size && size > 0) return path;
    }
    await sleep(150);
  }
  throw new Error(`No download matching ${pattern} appeared within ${timeoutMs / 1000}s`);
}

const frame = (n) => `${n} frame${n === 1 ? "" : "s"}`;

let code = 0;
try {
  const { frameTimes } = await loadFrameTimes();
  const fixtures = await loadFixtures();
  await new Promise((resolve) => fileServer.listen(FILE_PORT, resolve));
  served.set("/mediabunny.mjs", { file: join(root, "node_modules", "mediabunny", "dist", "bundles", "mediabunny.min.mjs"), type: "text/javascript" });

  const url = await startApp({ port: APP_PORT });
  await launchBrowser(DEBUG_PORT);
  const page = await openPage(DEBUG_PORT, url);
  const app = harness(page);

  // Downloads go to a folder we can read.
  const behaviour = await page.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  if (behaviour.error) await page.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });

  await app.perform(fixtures.abab);
  await page.waitFor(`!!document.querySelector("canvas")`, "the poster", 60_000);
  await app.useSuggestedTitle();
  await app.setByline("Dhwanit Shah");
  await app.settle(600);
  const totalMs = await app.totalMs();
  const info = await app.canvasInfo();
  console.log(`poem: ABAB, ${info.mood}, ${info.width} x ${info.height}, ${(totalMs / 1000).toFixed(1)} s\n`);

  const exportEnabled = `[...document.querySelectorAll("header button")].some((b) => b.textContent.trim() === "Export" && !b.disabled)`;
  const dialogState = (prop) => `document.querySelector("dialog[open]")?.dataset.${prop}`;
  const clickInDialog = (text) =>
    page.evaluate(`(() => {
      const button = [...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}) && !b.disabled);
      if (!button) throw new Error("No enabled dialog button starting with " + ${JSON.stringify(text)});
      button.click();
    })()`);
  const hasDialogButton = (text) =>
    page.evaluate(`[...document.querySelectorAll("dialog[open] button")].some((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}) && !b.disabled)`);

  async function openDialog() {
    await page.waitFor(exportEnabled, "the Export button to be enabled", 30_000);
    await page.evaluate(`[...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Export").click()`);
    await page.waitFor(`${dialogState("phase")} === "idle"`, "the export dialog", 10_000);
    await page.waitFor(`${dialogState("method")} !== "probing"`, "the browser check", 10_000);
  }

  // ---------------- 1. how will this browser export?
  await openDialog();
  const method = await page.evaluate(dialogState("method"));
  check("the browser exports frame by frame (WebCodecs H.264), not by recording", method === "frames", `method: ${method}`);
  if (method !== "frames") throw new Error("This browser cannot encode H.264 with WebCodecs; the rest of the check needs it.");

  // ---------------- 2. cancel part-way, then recover
  const cancelStarted = Date.now();
  await clickInDialog("Export reel");
  await page.waitFor(`Number(document.querySelector('[role=progressbar]')?.getAttribute("aria-valuenow")) >= 3`, "the progress bar to move", 60_000);
  await clickInDialog("Cancel");
  await page.waitFor(`${dialogState("phase")} === "idle"`, "the dialog to recover after Cancel", 30_000);
  const cancelNote = await page.evaluate(`document.querySelector("dialog[open] [role=status]")?.textContent ?? ""`);
  check("Cancel stops the export and the dialog is ready again", /cancel/i.test(cancelNote), `${Date.now() - cancelStarted} ms, note: "${cancelNote.trim()}"`);
  const stillRunning = await page.evaluate(`!!document.querySelector('[role=progressbar]')`);
  check("no progress bar is left behind after Cancel", !stillRunning);

  // ---------------- 3. export for real
  const exportStarted = Date.now();
  await clickInDialog("Export reel");
  await page.waitFor(`${dialogState("phase")} === "done" || ${dialogState("phase")} === "error"`, "the reel to finish", 300_000);
  const wallMs = Date.now() - exportStarted;
  const finalPhase = await page.evaluate(dialogState("phase"));
  const dialogText = await page.evaluate(`document.querySelector("dialog[open]")?.innerText ?? ""`);
  check("the export after a cancel finishes (the cancelled encoder was released)", finalPhase === "done", finalPhase === "error" ? dialogText.slice(0, 300) : "");
  if (finalPhase !== "done") throw new Error("The reel export failed.");
  const resultLine = await page.evaluate(`document.querySelector('dialog[open] section[aria-label="Result"] p')?.textContent ?? ""`);
  check('the dialog says "Your reel is ready"', /Your reel is ready/.test(dialogText));

  // Save it through the real download path.
  if (await hasDialogButton("Save to this device instead")) await clickInDialog("Save to this device instead");
  else await clickInDialog("Download");
  const mp4Path = await waitForDownload(/^stanza-.*\.mp4$/);
  const mp4Name = mp4Path.split(/[\\/]/).pop();
  check("the file is named stanza-<title>.mp4", /^stanza-[a-z0-9-]+\.mp4$/.test(mp4Name), mp4Name);
  served.set("/video.mp4", { file: mp4Path, type: "video/mp4" });

  // ---------------- 4. parse the MP4
  const mb = await import("mediabunny");
  const bytes = readFileSync(mp4Path);
  const input = new mb.Input({ source: new mb.BlobSource(new Blob([bytes])), formats: mb.ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  const codecString = await track.getCodecParameterString();
  const expected = frameTimes(totalMs, FPS);
  const duration = await track.computeDuration();
  const stats = await track.computePacketStats();
  const audio = await input.getAudioTracks();

  check("it is an MP4 (ftyp box)", bytes.subarray(4, 8).toString("latin1") === "ftyp");
  const boxes = [];
  for (let at = 0; at + 8 <= bytes.length; ) {
    let size = bytes.readUInt32BE(at);
    const type = bytes.subarray(at + 4, at + 8).toString("latin1");
    if (size === 1) size = Number(bytes.readBigUInt64BE(at + 8));
    boxes.push(type);
    if (size < 8) break;
    at += size;
  }
  check("the index (moov) comes before the media (mdat): fast start, ready for phones and Instagram", boxes.indexOf("moov") !== -1 && boxes.indexOf("moov") < boxes.indexOf("mdat"), boxes.join(" "));
  check("codec is H.264 (avc1)", track.codec === "avc" && /^avc1/.test(codecString ?? ""), `codec ${track.codec}, string ${codecString}`);
  check(`size is ${W} x ${H}`, track.displayWidth === W && track.displayHeight === H, `${track.displayWidth} x ${track.displayHeight}`);
  const frameMs = 1000 / FPS;
  check("duration is within one frame of the poem", Math.abs(duration * 1000 - totalMs) <= frameMs, `video ${(duration * 1000).toFixed(1)} ms, poem ${totalMs} ms, difference ${(duration * 1000 - totalMs).toFixed(1)} ms (one frame = ${frameMs.toFixed(1)} ms)`);
  check(`frame rate is ${FPS} fps`, Math.abs(stats.averagePacketRate - FPS) < 0.5, `${stats.averagePacketRate.toFixed(3)} fps`);
  check("it holds exactly the frames frameTimes() asks for", stats.packetCount === expected.length, `${frame(stats.packetCount)}, expected ${expected.length}`);
  check("there is no audio track (as designed)", audio.length === 0);

  const keyTimes = [];
  const sink = new mb.EncodedPacketSink(track);
  for await (const packet of sink.packets(undefined, undefined, { metadataOnly: true })) if (packet.type === "key") keyTimes.push(packet.timestamp);
  const gaps = keyTimes.slice(1).map((time, i) => time - keyTimes[i]);
  check("the first frame is a key frame, and there is one at least every 2 s", keyTimes[0] === 0 && Math.max(0, ...gaps) <= 2.05, `${keyTimes.length} key frames, longest gap ${Math.max(0, ...gaps).toFixed(2)} s`);
  const mbps = (bytes.length * 8) / duration / 1e6;
  console.log(`      file ${(bytes.length / 1e6).toFixed(2)} MB, average bitrate ${mbps.toFixed(2)} Mbps (target 8; a still, flat poster needs less)\n`);

  // ---------------- 5. decode frames and compare with the preview
  const picks = [Math.floor(expected.length * 0.3), Math.floor(expected.length * 0.6), expected.length - 1];
  const times = picks.map((i) => expected[i]);
  const decode = await page.evaluate(`(async () => {
    const compare = ${comparePixels.toString()};
    const params = ${JSON.stringify({ videoUrl: `http://localhost:${FILE_PORT}/video.mp4`, libUrl: `http://localhost:${FILE_PORT}/mediabunny.mjs`, picks, times, width: W, height: H, fps: FPS })};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const canvas = document.querySelector("canvas");
    const ctx = canvas.getContext("2d");

    // What the preview (renderFrame) draws at each chosen time.
    const refs = [];
    for (const t of params.times) {
      canvas.dispatchEvent(new CustomEvent("stanza:seek", { detail: t }));
      await sleep(300);
      refs.push(ctx.getImageData(0, 0, params.width, params.height).data.slice());
    }

    // Decode the whole video with VideoDecoder and keep the chosen frames.
    const mb = await import(params.libUrl);
    const blob = await (await fetch(params.videoUrl)).blob();
    const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    const config = await track.getDecoderConfig();
    const supported = await VideoDecoder.isConfigSupported(config);
    if (!supported.supported) return { error: "VideoDecoder does not support " + config.codec };

    const scratch = document.createElement("canvas");
    scratch.width = params.width;
    scratch.height = params.height;
    const sctx = scratch.getContext("2d");
    const decoded = new Array(params.picks.length).fill(null);
    let outputs = 0;
    let failure = null;
    const decoder = new VideoDecoder({
      output: (frame) => {
        outputs++;
        const index = Math.round((frame.timestamp * params.fps) / 1e6);
        const slot = params.picks.indexOf(index);
        if (slot !== -1) {
          sctx.drawImage(frame, 0, 0);
          decoded[slot] = sctx.getImageData(0, 0, params.width, params.height).data.slice();
        }
        frame.close();
      },
      error: (e) => { failure = String(e); },
    });
    decoder.configure(config);
    const sink = new mb.EncodedPacketSink(track);
    for await (const packet of sink.packets()) {
      decoder.decode(packet.toEncodedVideoChunk());
      while (decoder.decodeQueueSize > 8) await sleep(1);
    }
    await decoder.flush();
    decoder.close();
    if (failure) return { error: failure };

    const rows = params.picks.map((index, k) => {
      if (!decoded[k]) return { index, missing: true };
      const own = compare(decoded[k], refs[k]);
      const others = refs.map((ref, j) => (j === k ? null : compare(decoded[k], ref))).filter(Boolean);
      return { index, t: params.times[k], psnr: own.psnr, mad: own.mad, bestOtherPsnr: Math.max(...others.map((o) => o.psnr)) };
    });
    return { outputs, rows };
  })()`);

  if (decode.error) check("VideoDecoder decodes the exported video", false, decode.error);
  else {
    check("VideoDecoder decodes every frame", decode.outputs === expected.length, `${decode.outputs} decoded, ${expected.length} expected`);
    for (const row of decode.rows) {
      const label = `frame ${row.index} (t = ${(row.t / 1000).toFixed(2)} s)`;
      if (row.missing) {
        check(`${label} was decoded`, false);
        continue;
      }
      check(`${label} matches renderFrame: PSNR >= ${PSNR_FLOOR} dB`, row.psnr >= PSNR_FLOOR, `${row.psnr.toFixed(1)} dB, mean difference ${row.mad.toFixed(2)} of 255`);
      check(`${label} matches ITS OWN moment better than the other sampled moments`, row.psnr - row.bestOtherPsnr >= DISCRIMINATION_MARGIN_DB, `${row.psnr.toFixed(1)} dB against the best other ${row.bestOtherPsnr.toFixed(1)} dB`);
    }
  }

  // ---------------- 6. stills
  async function exportStill(label, choose) {
    await clickInDialog("Poster");
    await choose();
    await clickInDialog(label);
    await page.waitFor(`${dialogState("phase")} === "done" || ${dialogState("phase")} === "error"`, "the image", 60_000);
    if ((await page.evaluate(dialogState("phase"))) !== "done") throw new Error(`The ${label} export failed.`);
    if (await hasDialogButton("Save to this device instead")) await clickInDialog("Save to this device instead");
  }
  await exportStill("Download PNG", async () => {});
  const pngPath = await waitForDownload(/^stanza-.*\.png$/);
  await exportStill("Download JPEG", async () => page.evaluate(`[...document.querySelectorAll('dialog[open] [role=group][aria-label="Image type"] button')].find((b) => b.textContent.trim() === "JPEG").click()`));
  const jpgPath = await waitForDownload(/^stanza-.*\.jpg$/);
  served.set("/poster.png", { file: pngPath, type: "image/png" });
  served.set("/poster.jpg", { file: jpgPath, type: "image/jpeg" });

  const png = readFileSync(pngPath);
  check("the PNG is a PNG", png.subarray(1, 4).toString("latin1") === "PNG");
  check(`the PNG is ${W} x ${H}`, png.readUInt32BE(16) === W && png.readUInt32BE(20) === H, `${png.readUInt32BE(16)} x ${png.readUInt32BE(20)}`);

  const stillCheck = await page.evaluate(`(async () => {
    const compare = ${comparePixels.toString()};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const canvas = document.querySelector("canvas");
    canvas.dispatchEvent(new CustomEvent("stanza:seek", { detail: ${totalMs} }));
    await sleep(300);
    const ref = canvas.getContext("2d").getImageData(0, 0, ${W}, ${H}).data.slice();
    const scratch = document.createElement("canvas");
    scratch.width = ${W};
    scratch.height = ${H};
    const sctx = scratch.getContext("2d");
    const out = {};
    for (const [key, path] of [["png", "poster.png"], ["jpg", "poster.jpg"]]) {
      const blob = await (await fetch("http://localhost:${FILE_PORT}/" + path)).blob();
      const bitmap = await createImageBitmap(blob);
      sctx.clearRect(0, 0, ${W}, ${H});
      sctx.drawImage(bitmap, 0, 0);
      out[key] = { width: bitmap.width, height: bitmap.height, bytes: blob.size, ...compare(sctx.getImageData(0, 0, ${W}, ${H}).data, ref) };
    }
    return out;
  })()`);
  check("the PNG is identical to the final frame of the preview (lossless)", stillCheck.png.mse === 0, `PSNR ${stillCheck.png.psnr.toFixed(1)} dB`);
  check(`the JPEG is ${W} x ${H} and close to the final frame (PSNR >= 35 dB at quality 0.92)`, stillCheck.jpg.width === W && stillCheck.jpg.height === H && stillCheck.jpg.psnr >= 35, `${stillCheck.jpg.width} x ${stillCheck.jpg.height}, ${stillCheck.jpg.psnr.toFixed(1)} dB`);
  console.log(`      PNG ${(stillCheck.png.bytes / 1e6).toFixed(2)} MB, JPEG ${(stillCheck.jpg.bytes / 1e6).toFixed(2)} MB\n`);

  // ---------------- 6b. a poem of several pages: the page picker, and the last page IS the final frame
  async function freshEditor(query, fixture) {
    await page.navigate(`${url}/${query}`);
    await app.perform(fixtures[fixture]);
    await page.waitFor(`!!document.querySelector("canvas")`, "the poster", 60_000);
    await app.useSuggestedTitle();
    await app.setByline("Dhwanit Shah");
    await app.settle(600);
  }
  const clearDownloads = (pattern) => readdirSync(downloads).filter((n) => pattern.test(n)).forEach((n) => rmSync(join(downloads, n), { force: true }));
  clearDownloads(/.(png|jpg)$/); // so the next wait cannot pick up an earlier file
  await freshEditor("", "forty-lines");
  const pageCount = Number((await app.canvasInfo()).pages);
  await openDialog();
  await clickInDialog("Poster");
  const options = await page.evaluate(`[...document.querySelectorAll("#export-page option")].map((o) => o.textContent)`);
  check("a poem of several pages offers a page picker with one entry per page", pageCount > 1 && options.length === pageCount, `${pageCount} pages: ${options.join(", ")}`);
  const exportPage = async (pageNumber, name) => {
    await clickInDialog("Poster");
    await page.evaluate(`(() => {
      const select = document.querySelector("#export-page");
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, ${JSON.stringify(String(pageNumber))});
      select.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await clickInDialog("Download PNG");
    await page.waitFor(`${dialogState("phase")} === "done"`, `page ${pageNumber + 1}`, 60_000);
    if (await hasDialogButton("Save to this device instead")) await clickInDialog("Save to this device instead");
    const path = await waitForDownload(/^stanza-.*\.png$/);
    const copy = join(downloads, name);
    const { copyFileSync, unlinkSync } = await import("node:fs");
    copyFileSync(path, copy);
    unlinkSync(path);
    served.set(`/${name}`, { file: copy, type: "image/png" });
  };
  await exportPage(0, "page-first.png");
  await exportPage(pageCount - 1, "page-last.png");
  const multiTotal = await app.totalMs();
  const pages = await page.evaluate(`(async () => {
    const compare = ${comparePixels.toString()};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const canvas = document.querySelector("canvas");
    canvas.dispatchEvent(new CustomEvent("stanza:seek", { detail: ${multiTotal} }));
    await sleep(300);
    const final = canvas.getContext("2d").getImageData(0, 0, ${W}, ${H}).data.slice();
    const scratch = document.createElement("canvas");
    scratch.width = ${W};
    scratch.height = ${H};
    const sctx = scratch.getContext("2d");
    const read = async (name) => {
      const bitmap = await createImageBitmap(await (await fetch("http://localhost:${FILE_PORT}/" + name)).blob());
      sctx.clearRect(0, 0, ${W}, ${H});
      sctx.drawImage(bitmap, 0, 0);
      return sctx.getImageData(0, 0, ${W}, ${H}).data.slice();
    };
    const first = await read("page-first.png");
    const last = await read("page-last.png");
    return { lastVsFinal: compare(last, final).mse, firstVsFinal: compare(first, final).psnr };
  })()`);
  check("the last page's poster is exactly the final frame of the preview", pages.lastVsFinal === 0);
  check("the first page's poster is a different picture", pages.firstVsFinal < 40, `PSNR against the final frame ${pages.firstVsFinal.toFixed(1)} dB`);

  // ---------------- 6c. the fallback: real-time recording (forced with ?export=realtime)
  clearDownloads(/.(mp4|webm)$/);
  await freshEditor("?export=realtime", "abab");
  const realtimeTotal = await app.totalMs();
  await openDialog();
  const fallbackMethod = await page.evaluate(dialogState("method"));
  check("?export=realtime forces the real-time recorder", fallbackMethod === "realtime", `method: ${fallbackMethod}`);
  const warning = await page.evaluate(`document.querySelector("dialog[open] [role=note]")?.textContent ?? ""`);
  check("the dialog warns that it records in real time and the tab must stay in front", /real time/i.test(warning) && /in front/i.test(warning), warning.trim().slice(0, 90));
  const recordStarted = Date.now();
  await clickInDialog("Record reel");
  await page.waitFor(`Number(document.querySelector('[role=progressbar]')?.getAttribute("aria-valuenow")) >= 5`, "the recording to start", 30_000);
  const keepNote = await page.evaluate(`document.querySelector('dialog[open] [role=status]')?.textContent ?? ""`);
  check('while recording it says "Keep this tab in front"', /Keep this tab in front/.test(keepNote));
  await page.waitFor(`${dialogState("phase")} === "done" || ${dialogState("phase")} === "error"`, "the recording to finish", 120_000);
  const recordMs = Date.now() - recordStarted;
  check("the real-time recording finishes", (await page.evaluate(dialogState("phase"))) === "done", `${(recordMs / 1000).toFixed(1)} s for a ${(realtimeTotal / 1000).toFixed(1)} s poem`);
  check("real-time recording takes about as long as the poem (it cannot be faster)", recordMs >= realtimeTotal * 0.9);
  if (await hasDialogButton("Save to this device instead")) await clickInDialog("Save to this device instead");
  else await clickInDialog("Download");
  const recorded = await waitForDownload(/^stanza-.*\.(mp4|webm)$/);
  const recordedInput = new mb.Input({ source: new mb.BlobSource(new Blob([readFileSync(recorded)])), formats: mb.ALL_FORMATS });
  const recordedTrack = await recordedInput.getPrimaryVideoTrack();
  const recordedDuration = await recordedTrack.computeDuration();
  check(
    `the recording opens as a ${W} x ${H} video about as long as the poem`,
    recordedTrack.displayWidth === W && recordedTrack.displayHeight === H && Math.abs(recordedDuration * 1000 - realtimeTotal) < 1500,
    `${recorded.split(/[\\/]/).pop()}: ${recordedTrack.displayWidth} x ${recordedTrack.displayHeight}, ${recordedDuration.toFixed(2)} s, ${recordedTrack.codec}`,
  );

  // ---------------- 7. timing, and anything the page complained about
  const speedup = totalMs / wallMs;
  console.log(`encode time: ${(wallMs / 1000).toFixed(1)} s for a ${(totalMs / 1000).toFixed(1)} s reel (${expected.length} frames): ${speedup.toFixed(2)}x real time, ${(wallMs / expected.length).toFixed(1)} ms per frame`);
  console.log(`dialog: ${resultLine.trim()}\n`);
  // The check itself loads a second copy of Mediabunny into the page to decode; Mediabunny warns about that. Nothing else is excused.
  const problems = page.consoleLines.filter((line) => (line.type === "exception" || line.type === "error") && !line.url?.endsWith("/mediabunny.mjs"));
  check("the page logged no errors or exceptions", problems.length === 0, problems.map((p) => `${p.type}: ${p.text.slice(0, 500)} @ ${p.url ?? "?"}`).join(" | "));
  page.close();
} catch (error) {
  console.error(error);
  results.push({ name: "the check itself ran to the end", ok: false });
} finally {
  fileServer.close();
  cleanup();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
code = failed.length === 0 ? 0 : 1;
process.exit(code);
