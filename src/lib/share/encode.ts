// Share links: the poem and every setting live in the URL hash, compressed with lz-string. No database.
//   https://site/#p=<compressed JSON>
// The JSON carries a version number, so an old link is recognised instead of misread. Decoding never throws:
// a broken or outdated link returns a reason, and the poem when it can still be recovered.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { MOOD_IDS, type MoodId } from "@/lib/moods/ids";
import type { FormatId, TitlePlacement } from "@/lib/render/types";

export const SHARE_VERSION = 1;
export const HASH_KEY = "p";

/** Everything needed to rebuild the exact poster. */
export interface ShareState {
  poem: string;
  title: string;
  titlePlacement: TitlePlacement;
  byline: string;
  mood: MoodId;
  paletteVariant: number; // 0..2
  format: FormatId;
  /** Target length in ms, or null for Auto. */
  lengthMs: number | null;
  echoes: boolean;
  /** Ids of the emphasised words (the AI's pick, as the user left it). */
  emphasis: string[];
}

export type DecodeFailure = "empty" | "corrupt" | "version" | "invalid";

export type DecodeResult =
  | { ok: true; state: ShareState }
  | {
      ok: false;
      reason: DecodeFailure;
      /** A friendly sentence for the user. */
      message: string;
      /** The poem, when the link is broken but the poem could still be read out of it. */
      poem?: string;
    };

// Limits keep a hostile link from doing real work: nothing here is larger than a legitimate poster needs.
const MAX_PAYLOAD_CHARS = 16_000;
const MAX_JSON_CHARS = 40_000;
export const LIMITS = { poem: 2000, title: 120, byline: 80, emphasis: 200 } as const;
export const MIN_LENGTH_MS = 1000;
export const MAX_LENGTH_MS = 300_000;

const PLACEMENTS: readonly string[] = ["above", "footer", "hidden"];
const FORMATS: readonly string[] = ["reel", "post"];
const WORD_ID = /^w\d{1,5}$/;

/** Short keys: the link is shared in chats, so every byte counts. */
interface Wire {
  v: number;
  p: string;
  t: string;
  tp: string;
  b: string;
  m: string;
  pv: number;
  f: string;
  l: number | null;
  e: 0 | 1;
  em: string[];
}

export function encodeShare(state: ShareState): string {
  const wire: Wire = {
    v: SHARE_VERSION,
    p: state.poem,
    t: state.title,
    tp: state.titlePlacement,
    b: state.byline,
    m: state.mood,
    pv: state.paletteVariant,
    f: state.format,
    l: state.lengthMs,
    e: state.echoes ? 1 : 0,
    em: state.emphasis,
  };
  return compressToEncodedURIComponent(JSON.stringify(wire));
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Validates parsed JSON field by field. Returns the state, or the name of the first bad field. */
function validate(raw: Record<string, unknown>): { state: ShareState } | { bad: string } {
  const { p, t, tp, b, m, pv, f, l, e, em } = raw;
  if (typeof p !== "string" || p.trim() === "" || p.length > LIMITS.poem) return { bad: "poem" };
  if (typeof t !== "string" || t.length > LIMITS.title) return { bad: "title" };
  if (typeof tp !== "string" || !PLACEMENTS.includes(tp)) return { bad: "title placement" };
  if (typeof b !== "string" || b.length > LIMITS.byline) return { bad: "byline" };
  if (typeof m !== "string" || !(MOOD_IDS as readonly string[]).includes(m)) return { bad: "mood" };
  if (typeof pv !== "number" || !Number.isInteger(pv) || pv < 0 || pv > 2) return { bad: "palette" };
  if (typeof f !== "string" || !FORMATS.includes(f)) return { bad: "format" };
  if (l !== null && (typeof l !== "number" || !Number.isFinite(l) || l < MIN_LENGTH_MS || l > MAX_LENGTH_MS)) return { bad: "length" };
  if (e !== 0 && e !== 1) return { bad: "echoes" };
  if (!Array.isArray(em) || em.length > LIMITS.emphasis || !em.every((id) => typeof id === "string" && WORD_ID.test(id))) return { bad: "emphasis" };

  return {
    state: {
      poem: p,
      title: t,
      titlePlacement: tp as TitlePlacement,
      byline: b,
      mood: m as MoodId,
      paletteVariant: pv,
      format: f as FormatId,
      lengthMs: l === null ? null : Math.round(l),
      echoes: e === 1,
      emphasis: em as string[],
    },
  };
}

const failure = (reason: DecodeFailure, message: string, poem?: string): DecodeResult => ({ ok: false, reason, message, poem });

/** The poem out of an otherwise unusable link, if there is a sane one. */
const recoverablePoem = (raw: Record<string, unknown>): string | undefined =>
  typeof raw.p === "string" && raw.p.trim() !== "" && raw.p.length <= LIMITS.poem ? raw.p : undefined;

export function decodeShare(payload: string | null | undefined): DecodeResult {
  if (!payload || payload.trim() === "") return failure("empty", "That link has nothing in it.");
  if (payload.length > MAX_PAYLOAD_CHARS) return failure("corrupt", "That link looks damaged, so I couldn't open it.");

  let json: string | null;
  try {
    json = decompressFromEncodedURIComponent(payload);
  } catch {
    json = null;
  }
  if (!json || json.length > MAX_JSON_CHARS) return failure("corrupt", "That link looks damaged (part of it may have been cut off), so I couldn't open it.");

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return failure("corrupt", "That link looks damaged (part of it may have been cut off), so I couldn't open it.");
  }
  if (!isRecord(raw)) return failure("corrupt", "That link looks damaged, so I couldn't open it.");

  if (raw.v !== SHARE_VERSION) {
    return failure(
      "version",
      "That link was made with a different version of Stanza, so the settings can't be restored.",
      recoverablePoem(raw),
    );
  }

  const checked = validate(raw);
  if ("bad" in checked) {
    return failure("invalid", `That link has a problem with its ${checked.bad}, so the settings can't be restored.`, recoverablePoem(raw));
  }
  return { ok: true, state: checked.state };
}

/** "#p=..." for a state. */
export const shareHash = (state: ShareState): string => `#${HASH_KEY}=${encodeShare(state)}`;

/** The payload of a "#p=..." hash, or null if the hash is something else. */
export function readShareHash(hash: string): string | null {
  const match = new RegExp(`^#?${HASH_KEY}=(.*)$`, "s").exec(hash ?? "");
  return match ? match[1] : null;
}
