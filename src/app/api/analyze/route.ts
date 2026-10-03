import { NextResponse } from "next/server";
import { buildAnalysis } from "@/lib/ai/pipeline";
import { clientIp, createRateLimiter } from "@/lib/ai/rateLimit";

// The CMU dictionary is ~4.7 MB: keep this on the Node.js runtime, never Edge.
export const runtime = "nodejs";

const MAX_CHARS = 2000;
const MAX_LINES = 40;
const MAX_BODY_CHARS = 20_000; // refuse absurd bodies before parsing them
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

const limiter = createRateLimiter(RATE_LIMIT, RATE_WINDOW_MS);

// Loaded once per server instance, at module scope. The dictionary parse is the slow part of a cold start.
const prosodyReady = (async () => {
  const started = performance.now();
  const prosody = await import("@/lib/prosody");
  console.log(`[analyze] prosody engine loaded in ${Math.round(performance.now() - started)} ms`);
  return prosody;
})();

type ErrorCode = "bad_json" | "invalid_request" | "empty_poem" | "poem_too_long" | "too_many_lines" | "rate_limited" | "internal";

function fail(status: number, code: ErrorCode, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

/** Never logs poem text or keys: only counts, source, latency and status. */
function log(fields: Record<string, string | number>) {
  console.log(`[analyze] ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(" ")}`);
}

interface ParsedRequest {
  poem: string;
  skipAi: boolean;
}

function validate(body: unknown): ParsedRequest | Response {
  if (typeof body !== "object" || body === null || typeof (body as { poem?: unknown }).poem !== "string") {
    return fail(400, "invalid_request", 'Send JSON like { "poem": "your poem here" }.');
  }
  const { poem, skipAi } = body as { poem: string; skipAi?: unknown };
  if (skipAi !== undefined && typeof skipAi !== "boolean") {
    return fail(400, "invalid_request", '"skipAi" must be true or false.');
  }
  if (poem.trim() === "") return fail(400, "empty_poem", "Paste a poem first. There is nothing to read yet.");
  if (poem.length > MAX_CHARS) {
    return fail(400, "poem_too_long", `That poem is ${poem.length} characters. Stanza handles up to ${MAX_CHARS}.`);
  }
  const lineCount = poem.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "").length;
  if (lineCount > MAX_LINES) {
    return fail(400, "too_many_lines", `That poem has ${lineCount} lines. Stanza handles up to ${MAX_LINES}.`);
  }
  return { poem, skipAi: skipAi === true };
}

export async function POST(request: Request) {
  const started = performance.now();
  const latency = () => Math.round(performance.now() - started);

  if (!limiter.allow(clientIp(request.headers))) {
    log({ status: 429, latencyMs: latency() });
    return fail(429, "rate_limited", "Too many requests. Please wait a minute and try again.", { "Retry-After": "60" });
  }

  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) {
    return fail(400, "poem_too_long", `That request is too large. Poems can be up to ${MAX_CHARS} characters.`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    log({ status: 400, latencyMs: latency() });
    return fail(400, "bad_json", "The request body was not valid JSON.");
  }

  const parsed = validate(body);
  if (parsed instanceof Response) {
    log({ status: parsed.status, latencyMs: latency() });
    return parsed;
  }

  try {
    const { analyzePoem, toPublicProsody } = await prosodyReady;
    const result = analyzePoem(parsed.poem);
    if (result.wordCount === 0) {
      log({ status: 400, latencyMs: latency() });
      return fail(400, "empty_poem", "I couldn't find any words in that. Try pasting your poem again.");
    }

    const prosody = toPublicProsody(result);
    const { analysis, source, reason } = await buildAnalysis(prosody, { skipAi: parsed.skipAi });

    log({ status: 200, source, ...(reason ? { reason } : {}), lines: prosody.stanzas.reduce((n, s) => n + s.lines.length, 0), latencyMs: latency() });
    return NextResponse.json({ prosody, analysis, source });
  } catch {
    // Unexpected bug in our own code. Gemini failures never reach here (buildAnalysis falls back).
    log({ status: 500, latencyMs: latency() });
    return fail(500, "internal", "Something went wrong reading that poem. Please try again.");
  }
}
