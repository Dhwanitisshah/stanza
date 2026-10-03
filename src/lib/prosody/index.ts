import "server-only";

// SERVER-ONLY. This module bundles the CMU Pronouncing Dictionary (~4.7 MB).
// Import it only from server code (e.g. /api/analyze), never from a client component.
// It is pure TypeScript: no DOM and no Next.js imports.
export { analyzePoem, toPublicProsody } from "./analyze";
export type { AnalyzedLine, AnalyzedStanza, AnalyzedWord, ProsodyResult, PublicLine, PublicProsody, PublicStanza, PublicWord } from "./analyze";
export type { RhymeGroup, RhymePair, RhymeStrength } from "./rhyme";
export type { Token } from "./tokenize";
