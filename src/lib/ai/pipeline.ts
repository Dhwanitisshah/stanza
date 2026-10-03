import "server-only";
import { fallbackAnalysis } from "./fallback";
import { AiError, requestGeminiAnalysis, type AiFailureReason } from "./gemini";
import { sanitizeAnalysis } from "./sanitize";
import { AnalysisSchema, type Analysis, type AnalysisSource } from "./schema";
import type { PublicProsody } from "@/lib/prosody";

export interface AnalysisOutcome {
  analysis: Analysis;
  source: AnalysisSource;
  /** Why Gemini wasn't used (logged by the route, never sent to the client). */
  reason?: AiFailureReason | "schema_mismatch" | "forced" | "no_key" | "skipped";
}

/** Gemini if possible, the deterministic fallback otherwise. Never throws. */
export async function buildAnalysis(
  prosody: PublicProsody,
  options: { skipAi?: boolean; timeoutMs?: number } = {},
): Promise<AnalysisOutcome> {
  const fallback = (source: AnalysisSource, reason: AnalysisOutcome["reason"]): AnalysisOutcome => ({
    analysis: fallbackAnalysis(prosody),
    source,
    reason,
  });

  if (options.skipAi) return fallback("skipped", "skipped");
  if (process.env.FORCE_FALLBACK === "1") return fallback("fallback", "forced");
  if (!process.env.GEMINI_API_KEY) return fallback("fallback", "no_key");

  try {
    const raw = await requestGeminiAnalysis(prosody, options.timeoutMs);
    const parsed = AnalysisSchema.safeParse(raw);
    if (!parsed.success) return fallback("fallback", "schema_mismatch");
    return { analysis: sanitizeAnalysis(parsed.data, prosody), source: "gemini" };
  } catch (error) {
    return fallback("fallback", error instanceof AiError ? error.reason : "api_error");
  }
}
