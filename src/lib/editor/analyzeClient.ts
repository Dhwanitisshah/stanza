// The browser side of /api/analyze: one fetch, friendly errors, and how long it took.
import type { Analysis, AnalysisSource } from "@/lib/ai/schema";
import type { PublicProsody } from "@/lib/prosody";

export interface AnalyzeResponse {
  prosody: PublicProsody;
  analysis: Analysis;
  source: AnalysisSource;
}

export interface AnalyzeResult extends AnalyzeResponse {
  /** How long the whole request took, in ms. */
  latencyMs: number;
}

export const POEM_LIMITS = { chars: 2000, lines: 40 } as const;

/** Checks the limits before asking the server, so the message appears at once. Returns a sentence, or null if fine. */
export function poemProblem(poem: string): string | null {
  if (poem.trim() === "") return "Paste a poem first. There is nothing to read yet.";
  if (poem.length > POEM_LIMITS.chars) return `That poem is ${poem.length} characters. Stanza handles up to ${POEM_LIMITS.chars}.`;
  const lines = poem.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "").length;
  if (lines > POEM_LIMITS.lines) return `That poem has ${lines} lines. Stanza handles up to ${POEM_LIMITS.lines}.`;
  return null;
}

/** Throws an Error whose message is safe to show the user. */
export async function analyzePoem(poem: string, options: { skipAi?: boolean } = {}): Promise<AnalyzeResult> {
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ poem, skipAi: options.skipAi === true }),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error?.message ?? `The server answered ${response.status}. Please try again.`);
  return { ...(json as AnalyzeResponse), latencyMs: performance.now() - started };
}
