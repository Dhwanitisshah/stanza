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
  { width = 1100, height = 1500, ready = 'document.readyState === "complete" && !!document.querySelector("textarea")' } = {},
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

  return { send, evaluate, waitFor, consoleLines, screenshot, close: () => ws.close() };
}

/** Helpers that operate the TEMP dev harness the way a person would. */
export function harness(page) {
  const setNative = (selector, prototype, value) =>
    page.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(${prototype}.prototype, "value").set.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event(${prototype === "HTMLSelectElement" ? '"change"' : '"input"'}, { bubbles: true }));
    })()`);
  const clickButton = (text) =>
    page.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(text)})?.click() ?? "no button"`);

  return {
    setPoem: (text) => setNative("textarea", "HTMLTextAreaElement", text),
    setMood: (mood) => setNative('select[aria-label="Mood"]', "HTMLSelectElement", mood),
    setByline: (text) => setNative('input[aria-label="Byline"]', "HTMLInputElement", text),
    setFormat: (format) => page.evaluate(`document.querySelector('input[type=radio][value="${format}"]').click()`),
    analyze: () => clickButton("Analyze"),
    pause: () => clickButton("Pause"),
    seek: (ms) => setNative("input[type=range]", "HTMLInputElement", ms),
    totalMs: () => page.evaluate(`Number(document.querySelector("input[type=range]").max)`),
    canvasInfo: () =>
      page.evaluate(`(() => {
        const c = document.querySelector("canvas");
        return c && { width: c.width, height: c.height, ...c.dataset };
      })()`),
    canvasPng: async () => {
      const dataUrl = await page.evaluate(`document.querySelector("canvas").toDataURL("image/png")`);
      return Buffer.from(dataUrl.split(",")[1], "base64");
    },
  };
}
