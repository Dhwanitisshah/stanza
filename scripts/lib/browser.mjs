// Shared helpers for the dev tools that drive the real app in headless Edge/Chrome over the DevTools protocol.
// No extra dependency: Node 22 has a global WebSocket and fetch.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../..", import.meta.url));
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BROWSER_CANDIDATES = [
  process.env.STANZA_BROWSER,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

export function findBrowser() {
  const found = BROWSER_CANDIDATES.find((path) => existsSync(path));
  if (!found) throw new Error("No Edge or Chrome found. Set STANZA_BROWSER to its executable path.");
  return found;
}

const children = [];
function killTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGKILL");
}
export function cleanup() {
  children.splice(0).forEach(killTree);
}
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

async function waitForHttp(url, timeoutMs, label) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`${label} did not start within ${timeoutMs / 1000}s`);
}

/** Starts the Next.js server: "start" serves the production build, "dev" runs the dev server. */
export async function startApp({ mode = "start", port, env = {} }) {
  if (mode === "start" && !existsSync(join(root, ".next", "BUILD_ID"))) {
    throw new Error("No production build found. Run `npm run build` first.");
  }
  const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
  const args = mode === "dev" ? [nextBin, "dev", "-p", String(port)] : [nextBin, "start", "-p", String(port)];
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, FORCE_FALLBACK: "1", ...env },
    stdio: "ignore",
  });
  children.push(child);
  await waitForHttp(`http://localhost:${port}/`, 60_000, "The Next.js server");
  return `http://localhost:${port}`;
}

export async function launchBrowser(debugPort) {
  const profile = mkdtempSync(join(tmpdir(), "stanza-browser-"));
  const child = spawn(
    findBrowser(),
    ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"],
    { stdio: "ignore" },
  );
  children.push(child);
  process.on("exit", () => {
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* the browser may still hold files for a moment; the OS temp folder will clean up */
    }
  });
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, 20_000, "The browser");
}

/** Opens a page and returns small helpers around the DevTools protocol. */
export async function openPage(
  debugPort,
  url,
  { width = 1280, height = 1000, ready = 'document.readyState === "complete" && !!document.querySelector("textarea")' } = {},
) {
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let nextId = 0;
  const pending = new Map();
  const consoleLines = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method === "Runtime.consoleAPICalled") {
      consoleLines.push({ type: message.params.type, text: message.params.args.map((a) => a.value ?? a.description).join(" ") });
    } else if (message.method === "Runtime.exceptionThrown") {
      consoleLines.push({ type: "exception", text: message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text });
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response.result.exceptionDetails) {
      throw new Error(response.result.exceptionDetails.exception?.description ?? "evaluate failed");
    }
    return response.result.result.value;
  };
  const waitFor = async (expression, label, timeoutMs = 20_000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await waitFor(ready, "the page to load");

  /** Full-page PNG screenshot as a Buffer. */
  const screenshot = async () => {
    const response = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    return Buffer.from(response.result.data, "base64");
  };

  /** Loads a URL in this page and waits for it to be ready. */
  const navigate = async (to, isReady = ready) => {
    await send("Page.navigate", { url: to });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(isReady, "the page to load");
  };

  return { send, evaluate, waitFor, consoleLines, screenshot, navigate, close: () => ws.close() };
}

/** Helpers that operate the real app (landing page, then the editor) the way a person would. */
export function harness(page) {
  const setNative = (selector, prototype, value) =>
    page.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error("No element " + ${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(${prototype}.prototype, "value").set.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
  const clickText = (scope, text) =>
    page.evaluate(`(() => {
      const scope = document.querySelector(${JSON.stringify(scope)}) ?? document;
      const button = [...scope.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}) && !b.disabled);
      if (!button) throw new Error("No enabled button starting with " + ${JSON.stringify(text)});
      button.click();
    })()`);
  const tab = (name) => page.evaluate(`document.querySelector('[role=tab][aria-label="${name}"]').click()`);
  const settle = (ms = 400) => page.evaluate(`new Promise((r) => setTimeout(r, ${ms}))`);

  return {
    /**
     * Landing page: type the poem and press "Perform it". Retries until the editor opens, because text typed
     * before React has hydrated is wiped when hydration finishes.
     */
    async perform(poem, title = "") {
      for (let attempt = 0; attempt < 6; attempt++) {
        await setNative("#landing-poem", "HTMLTextAreaElement", poem);
        if (title) await setNative("#landing-title", "HTMLInputElement", title);
        await clickText("main", "Perform it");
        const end = Date.now() + 2000;
        while (Date.now() < end) {
          if (await page.evaluate('!!document.querySelector("#editor-poem")')) return;
          await settle(100);
        }
      }
      throw new Error("The editor did not open after pressing Perform it.");
    },
    async setMood(mood) {
      await tab("Mood");
      await page.evaluate(`document.querySelector('[role=group][aria-label="Mood"] button[data-mood="${mood}"]').click()`);
    },
    async setFormat(format) {
      await tab("Timing");
      await clickText('[role=group][aria-label="Format"]', format === "reel" ? "Reel" : "Post");
    },
    async setByline(text) {
      await tab("Text");
      await setNative("#byline", "HTMLInputElement", text);
      await settle(600); // the editor waits for typing to stop before rebuilding
    },
    /** Accepts the suggested title (the poster shows a title only when the user sets or accepts one). */
    async useSuggestedTitle() {
      await page.waitFor(`!!document.querySelector('button[aria-label^="Use the suggested title"]')`, "the title suggestion");
      await page.evaluate(`document.querySelector('button[aria-label^="Use the suggested title"]').click()`);
      await settle(600);
    },
    // ---- Styling: the Background and Text tabs, driven like a person would.
    tab,
    async setBackgroundColour(hex) {
      await tab("Background");
      await clickText('[role=group][aria-label="Background source"]', "Colour");
      await settle(150);
      await setNative('input[type=color][aria-label="Pick another colour"]', "HTMLInputElement", hex.toLowerCase());
    },
    /** Uploads a file through the real file input (the Image source must be showing). */
    async uploadImage(path) {
      await tab("Background");
      await clickText('[role=group][aria-label="Background source"]', "Image");
      await settle(150);
      const doc = await page.send("DOM.getDocument", { depth: 0 });
      const input = await page.send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: 'input[type=file]' });
      await page.send("DOM.setFileInputFiles", { files: [path], nodeId: input.result.nodeId });
    },
    async setDarken(percent) {
      await setNative("#darken", "HTMLInputElement", percent);
    },
    async setPattern(id) {
      await tab("Background");
      await page.evaluate(`document.querySelector('[role=group][aria-label="Pattern"] button[data-pattern="${id}"]').click()`);
    },
    async setPatternStrength(value) {
      await setNative("#pattern-strength", "HTMLInputElement", value);
    },
    async setLineColour(line, hex) {
      await tab("Text");
      await setNative(`input[type=color][aria-label="Colour for line ${line + 1}"]`, "HTMLInputElement", hex.toLowerCase());
    },
    async setEmphasisColour(hex) {
      await tab("Text");
      await setNative('input[type=color][aria-label="Colour for important words"]', "HTMLInputElement", hex.toLowerCase());
    },
    /** Marks exactly these words (the first occurrence of each), replacing Stanza's own pick. */
    async setImportantWords(words) {
      await tab("Text");
      await page.evaluate(`(() => {
        const group = document.querySelector('[role=group][aria-label="Important words"]');
        const chips = [...group.querySelectorAll("button")];
        for (const chip of chips) if (chip.getAttribute("aria-pressed") === "true") chip.click();
      })()`);
      await settle(100);
      for (const word of words) {
        await page.evaluate(`(() => {
          const group = document.querySelector('[role=group][aria-label="Important words"]');
          const chip = [...group.querySelectorAll("button")].find((b) => b.textContent.trim().toLowerCase() === ${JSON.stringify(word.toLowerCase())} && b.getAttribute("aria-pressed") !== "true");
          if (!chip) throw new Error("No word " + ${JSON.stringify(word)});
          chip.click();
        })()`);
        await settle(60);
      }
    },
    async resetStyling() {
      await tab("Text");
      await clickText("[role=tabpanel]", "Reset styling");
    },
    async setTitlePlacement(label) {
      await tab("Text");
      await clickText('[role=group][aria-label="Title placement"]', label);
    },
    /** Builds a procedural "photo" in the page (sky, sun, hills, a little noise) and writes it to a temp file. */
    async makePhotoFile({ width = 1600, height = 1000, type = "image/jpeg", name = "photo.jpg" } = {}) {
      const dataUrl = await page.evaluate(`(() => {
        const c = document.createElement("canvas");
        c.width = ${width}; c.height = ${height};
        const x = c.getContext("2d");
        const sky = x.createLinearGradient(0, 0, 0, c.height);
        sky.addColorStop(0, "#27406b"); sky.addColorStop(0.55, "#d98a5b"); sky.addColorStop(1, "#f2c48a");
        x.fillStyle = sky; x.fillRect(0, 0, c.width, c.height);
        x.fillStyle = "#f7e2a8"; x.beginPath(); x.arc(c.width * 0.7, c.height * 0.5, c.height * 0.08, 0, Math.PI * 2); x.fill();
        x.fillStyle = "#1b2a2f"; x.beginPath(); x.moveTo(0, c.height);
        for (let i = 0; i <= 20; i++) x.lineTo((i / 20) * c.width, c.height * (0.72 + 0.08 * Math.sin(i * 0.9)));
        x.lineTo(c.width, c.height); x.fill();
        return c.toDataURL(${JSON.stringify(type)}, 0.85);
      })()`);
      const { mkdtempSync, writeFileSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = mkdtempSync(join(tmpdir(), "stanza-photo-"));
      const path = join(dir, name);
      writeFileSync(path, Buffer.from(dataUrl.split(",")[1], "base64"));
      return path;
    },
    /** A file that pretends to be something it is not (a HEIC photo, a text file) for the error paths. */
    async makeFakeFile(name, contents = "not really an image") {
      const { mkdtempSync, writeFileSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const path = join(mkdtempSync(join(tmpdir(), "stanza-fake-")), name);
      writeFileSync(path, contents);
      return path;
    },
    /** Applies a style description (see tests/fixtures/styles/) to the open editor. */
    async applyStyle(style, fixtures = {}) {
      if (style.mood) await this.setMood(style.mood);
      if (style.titlePlacement) await this.setTitlePlacement(style.titlePlacement);
      const bg = style.background;
      if (bg?.kind === "colour") await this.setBackgroundColour(bg.colour);
      if (bg?.kind === "image") {
        const path = fixtures.photoPath ?? (await this.makePhotoFile(bg.photo ?? {}));
        await this.uploadImage(path);
        await page.waitFor('!!document.querySelector("#darken")', "the photo to load", 30000);
        if (bg.darken !== undefined) await this.setDarken(bg.darken);
      }
      if (style.pattern) await this.setPattern(style.pattern);
      if (style.patternStrength !== undefined) await this.setPatternStrength(style.patternStrength);
      for (const [line, hex] of Object.entries(style.lineColours ?? {})) await this.setLineColour(Number(line), hex);
      if (style.important) await this.setImportantWords(style.important);
      if (style.emphasisColour) await this.setEmphasisColour(style.emphasisColour);
      await settle(700);
    },
    /** Pause and jump to an exact time (the canvas listens for "stanza:seek"). */
    seek: (ms) => page.evaluate(`document.querySelector("canvas").dispatchEvent(new CustomEvent("stanza:seek", { detail: ${Number(ms)} }))`),
    totalMs: () => page.evaluate(`Number(document.querySelector("canvas").dataset.totalMs)`),
    reviewMs: () => page.evaluate(`Number(document.querySelector("canvas").dataset.reviewMs)`),
    canvasInfo: () =>
      page.evaluate(`(() => {
        const c = document.querySelector("canvas");
        return c && { width: c.width, height: c.height, ...c.dataset };
      })()`),
    canvasPng: async () => {
      const dataUrl = await page.evaluate(`document.querySelector("canvas").toDataURL("image/png")`);
      return Buffer.from(dataUrl.split(",")[1], "base64");
    },
    settle,
  };
}
