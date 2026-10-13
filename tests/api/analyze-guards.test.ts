import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAnalysis } from "@/lib/ai/pipeline";
import { aiEnabled, createDailyCap, dailyCapFromEnv, DEFAULT_DAILY_CAP } from "@/lib/ai/guard";
import { isJsonContentType, MAX_BODY_BYTES, readBodyLimited } from "@/lib/ai/requestBody";
import { analyzePoem, toPublicProsody } from "@/lib/prosody";
import { LAMP_ABAB } from "../fixtures/poems";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock("@google/genai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import * as route from "@/app/api/analyze/route";

const validAnalysis = { mood: "Tender", intensity: 0.7, emphasis: ["w1"], title: "patient moon", paletteVariant: 1, reading: "A hushed room." };
let ipCounter = 0;
const nextIp = () => `10.1.0.${++ipCounter}`;

function request(init: { contentType?: string | null; body?: BodyInit | null; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": nextIp(), ...init.headers };
  if (init.contentType !== null) headers["content-type"] = init.contentType ?? "application/json";
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers,
    body: init.body === undefined ? JSON.stringify({ poem: LAMP_ABAB }) : init.body,
  });
}

beforeEach(() => {
  generateContent.mockReset();
  generateContent.mockResolvedValue({ text: JSON.stringify(validAnalysis) });
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("FORCE_FALLBACK", "0");
  vi.stubEnv("AI_ENABLED", "");
  vi.stubEnv("GEMINI_DAILY_CAP", "");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("route configuration", () => {
  it("states its runtime and its time limit explicitly", () => {
    expect(route.runtime).toBe("nodejs");
    expect(route.maxDuration).toBe(15);
  });
});

describe("methods: POST only", () => {
  it.each(["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"] as const)("%s answers 405 with Allow: POST", async (method) => {
    const res = route[method]();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    if (method !== "HEAD") expect((await res.json()).error.code).toBe("method_not_allowed");
  });
});

describe("content type: JSON only", () => {
  it("accepts application/json, with a charset, in any case", () => {
    for (const ok of ["application/json", "application/json; charset=utf-8", "Application/JSON", "  application/json ;charset=UTF-8"]) {
      expect(isJsonContentType(ok)).toBe(true);
    }
  });

  it("rejects everything else", () => {
    for (const bad of [null, "", "text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/jsonp", "application/ld+json", "text/json"]) {
      expect(isJsonContentType(bad)).toBe(false);
    }
  });

  it.each(["text/plain", "application/x-www-form-urlencoded"])("the route answers 415 for %s, without calling Gemini", async (contentType) => {
    const res = await route.POST(request({ contentType }));
    expect(res.status).toBe(415);
    expect((await res.json()).error.code).toBe("unsupported_media_type");
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe("body size: 16 KB at most", () => {
  it("answers 413 when the body is over 16 KB", async () => {
    const res = await route.POST(request({ body: JSON.stringify({ poem: "a".repeat(MAX_BODY_BYTES) }) }));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("payload_too_large");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("answers 413 from Content-Length alone, before reading anything", async () => {
    const res = await route.POST(request({ body: "{}", headers: { "content-length": String(MAX_BODY_BYTES + 1) } }));
    expect(res.status).toBe(413);
  });

  it("stops reading a stream that never ends", async () => {
    let chunksPulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksPulled++;
        controller.enqueue(new TextEncoder().encode("a".repeat(4096)));
      },
    });
    const read = await readBodyLimited(new Request("http://localhost/x", { method: "POST", body: endless, duplex: "half" } as RequestInit));
    expect(read).toEqual({ ok: false, reason: "too_large" });
    expect(chunksPulled).toBeLessThan(10); // it gave up at about 16 KB instead of draining the stream
  });

  it("counts bytes, not characters", async () => {
    const emoji = "😀".repeat(MAX_BODY_BYTES / 4); // 4 bytes each, a quarter as many characters as bytes
    expect((await readBodyLimited(new Request("http://localhost/x", { method: "POST", body: emoji }))).ok).toBe(true);
    expect((await readBodyLimited(new Request("http://localhost/x", { method: "POST", body: emoji + "😀" }))).ok).toBe(false);
  });

  it("accepts the biggest legal poem (2000 characters, every one escaped)", async () => {
    const body = JSON.stringify({ poem: "\u0001".repeat(2000), skipAi: true }); // 6 bytes each once escaped
    expect(body.length).toBeLessThan(MAX_BODY_BYTES);
    const res = await route.POST(request({ body }));
    expect(res.status).toBe(400); // not 413: it got past the size check and was refused as a poem with no words
    expect((await res.json()).error.code).toBe("empty_poem");
  });
});

describe("AI_ENABLED: the kill switch", () => {
  it("reads false, 0, off and no as off, and anything else (or nothing) as on", () => {
    for (const off of ["false", "FALSE", " false ", "0", "off", "no"]) expect(aiEnabled({ AI_ENABLED: off })).toBe(false);
    for (const on of [undefined, "", "true", "1", "yes", "banana"]) expect(aiEnabled({ AI_ENABLED: on })).toBe(true);
  });

  it("AI_ENABLED=false never calls Gemini and still answers 200 with the fallback", async () => {
    vi.stubEnv("AI_ENABLED", "false");
    const res = await route.POST(request());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.source).toBe("fallback");
    expect(json.analysis.mood).toBeTypeOf("string");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("is checked on every request, so flipping it needs no new code", async () => {
    vi.stubEnv("AI_ENABLED", "false");
    expect((await (await route.POST(request())).json()).source).toBe("fallback");
    vi.stubEnv("AI_ENABLED", "true");
    expect((await (await route.POST(request())).json()).source).toBe("gemini");
  });
});

describe("GEMINI_DAILY_CAP", () => {
  it("defaults to 500 and never to 'unlimited'", () => {
    expect(DEFAULT_DAILY_CAP).toBe(500);
    for (const raw of [undefined, "", "abc", "-5", "1.5", "1e3", "99999999999"]) expect(dailyCapFromEnv({ GEMINI_DAILY_CAP: raw })).toBe(500);
    expect(dailyCapFromEnv({ GEMINI_DAILY_CAP: " 25 " })).toBe(25);
    expect(dailyCapFromEnv({ GEMINI_DAILY_CAP: "0" })).toBe(0);
  });

  it("allows exactly `limit` calls a day, then says no without counting", () => {
    const cap = createDailyCap(() => 3);
    expect([cap.take(), cap.take(), cap.take(), cap.take(), cap.take()]).toEqual([true, true, true, false, false]);
    expect(cap.used()).toBe(3);
  });

  it("starts again at midnight UTC", () => {
    let now = Date.UTC(2026, 9, 14, 23, 59, 59);
    const cap = createDailyCap(() => 1, () => now);
    expect(cap.take()).toBe(true);
    expect(cap.take()).toBe(false);
    now = Date.UTC(2026, 9, 15, 0, 0, 1);
    expect(cap.take()).toBe(true);
    expect(cap.used()).toBe(1);
  });

  it("reads the limit when it is asked, so a changed limit applies at once", () => {
    let limit = 1;
    const cap = createDailyCap(() => limit);
    expect(cap.take()).toBe(true);
    expect(cap.take()).toBe(false);
    limit = 2;
    expect(cap.take()).toBe(true);
  });

  it("over the cap the route falls back with 200, not an error, and stops calling Gemini", async () => {
    vi.stubEnv("GEMINI_DAILY_CAP", "2");
    vi.resetModules(); // the route keeps its counter at module level; earlier tests in this file already spent some of it
    const fresh = await import("@/app/api/analyze/route");
    const sources: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await fresh.POST(request());
      expect(res.status).toBe(200);
      sources.push((await res.json()).source);
    }
    expect(sources).toEqual(["gemini", "gemini", "fallback", "fallback"]);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("only real Gemini calls count: skipAi, the kill switch and a missing key leave the cap alone", async () => {
    const prosody = toPublicProsody(analyzePoem(LAMP_ABAB));
    const cap = createDailyCap(() => 100);

    await buildAnalysis(prosody, { skipAi: true, dailyCap: cap });
    vi.stubEnv("AI_ENABLED", "false");
    await buildAnalysis(prosody, { dailyCap: cap });
    vi.stubEnv("AI_ENABLED", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    await buildAnalysis(prosody, { dailyCap: cap });
    expect(cap.used()).toBe(0);

    vi.stubEnv("GEMINI_API_KEY", "test-key");
    await buildAnalysis(prosody, { dailyCap: cap });
    expect(cap.used()).toBe(1);
  });

  it("GEMINI_DAILY_CAP=0 means every poem takes the fallback", async () => {
    const prosody = toPublicProsody(analyzePoem(LAMP_ABAB));
    vi.stubEnv("GEMINI_DAILY_CAP", "0");
    const outcome = await buildAnalysis(prosody, { dailyCap: createDailyCap() });
    expect(outcome).toMatchObject({ source: "fallback", reason: "daily_cap" });
    expect(generateContent).not.toHaveBeenCalled();
  });
});
