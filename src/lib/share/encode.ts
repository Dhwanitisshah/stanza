// Share links: the poem and every setting live in the URL hash, compressed with lz-string. No database.
//   https://site/#p=<compressed JSON>
// The JSON carries a version number, so an old link is recognised instead of misread. Decoding never throws:
// a broken or outdated link returns a reason, and the poem when it can still be recovered.
//
// Version 1: poem, title, placement, byline, mood, palette, format, length, echoes, emphasis.
// Version 2: + background (mood paper or a colour), pattern and its strength, line colours, emphasis colour.
//   A photo background is NEVER in a link (the image stays in the browser). If the sender used one, the link opens
//   on the mood's paper and says so. Version 1 links still open: they get the version 2 defaults.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { MOOD_IDS, type MoodId } from "@/lib/moods/ids";
import { PATTERN_IDS, type PatternId } from "@/lib/render/patterns";
import { isHexColour } from "@/lib/render/styling";
import type { FormatId, TitlePlacement } from "@/lib/render/types";

export const SHARE_VERSION = 2;
export const HASH_KEY = "p";

/** The background as the link records it. `image` is only ever written, never read back (see above). */
export type ShareBackground = { kind: "mood" } | { kind: "colour"; colour: string } | { kind: "image"; darken: number };

/** Everything needed to rebuild the exact poster (except a photo). */
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
  background: ShareBackground;
  pattern: PatternId;
  /** 0..100 */
  patternStrength: number;
  /** Colour overrides by global line index. */
  lineColours: Record<number, string>;
  /** Colour of the emphasised words; null = the mood's own. */
  emphasisColour: string | null;
}

export type DecodeFailure = "empty" | "corrupt" | "version" | "invalid";

export type DecodeResult =
  | {
      ok: true;
      state: ShareState;
      /** The version the link was written in. Older ones were migrated. */
      version: number;
      /** One-line things to tell the user (e.g. that a photo background could not come along). */
      notices: string[];
    }
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
export const LIMITS = { poem: 2000, title: 120, byline: 80, emphasis: 200, lines: 100 } as const;
export const MIN_LENGTH_MS = 1000;
export const MAX_LENGTH_MS = 300_000;
export const MAX_DARKEN_PERCENT = 80;

export const IMAGE_NOTICE = "The sender used a photo background. Photos are never included in links, so this opens on the mood's paper instead.";

const PLACEMENTS: readonly string[] = ["above", "footer", "hidden"];
const FORMATS: readonly string[] = ["reel", "post"];
const WORD_ID = /^w\d{1,5}$/;

/** Short keys: the link is shared in chats, so every byte counts. Version 2 fields are optional on the way in. */
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
  /** background: "m" mood, "c" colour (bc), "i" photo (bd = darken %) */
  bg?: "m" | "c" | "i";
  bc?: string;
  bd?: number;
  pt?: string;
  ps?: number;
  lc?: Record<string, string>;
  ec?: string | null;
}

export function encodeShare(state: ShareState): string {
  const { background } = state;
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
    bg: background.kind === "colour" ? "c" : background.kind === "image" ? "i" : "m",
    ...(background.kind === "colour" ? { bc: background.colour } : {}),
    ...(background.kind === "image" ? { bd: Math.round(background.darken * 100) } : {}),
    pt: state.pattern,
    ps: Math.round(state.patternStrength),
    lc: Object.fromEntries(Object.entries(state.lineColours).map(([line, colour]) => [line, colour])),
    ec: state.emphasisColour,
  };
  return compressToEncodedURIComponent(JSON.stringify(wire));
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

type Checked = { state: ShareState; notices: string[] } | { bad: string };

/** Version 1 fields, shared by both versions. */
function validateCore(raw: Record<string, unknown>): { core: Omit<ShareState, "background" | "pattern" | "patternStrength" | "lineColours" | "emphasisColour"> } | { bad: string } {
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
    core: {
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

/** Version 2 fields. Absent ones take their defaults (so a version 1 link migrates through here too). */
function validateLook(raw: Record<string, unknown>): { look: Pick<ShareState, "background" | "pattern" | "patternStrength" | "lineColours" | "emphasisColour">; notices: string[] } | { bad: string } {
  const { bg = "m", bc, bd, pt = "none", ps = 50, lc = {}, ec = null } = raw;
  const notices: string[] = [];

  let background: ShareBackground = { kind: "mood" };
  if (bg === "c") {
    if (!isHexColour(bc)) return { bad: "background colour" };
    background = { kind: "colour", colour: bc.toUpperCase() };
  } else if (bg === "i") {
    // Validate it (a broken value is still a broken link) but never restore it: there is no photo to restore.
    if (bd !== undefined && (typeof bd !== "number" || !Number.isFinite(bd) || bd < 0 || bd > MAX_DARKEN_PERCENT)) return { bad: "background darkening" };
    notices.push(IMAGE_NOTICE);
  } else if (bg !== "m") return { bad: "background" };

  if (typeof pt !== "string" || !(PATTERN_IDS as readonly string[]).includes(pt)) return { bad: "pattern" };
  if (typeof ps !== "number" || !Number.isFinite(ps) || ps < 0 || ps > 100) return { bad: "pattern strength" };

  if (!isRecord(lc)) return { bad: "line colours" };
  const entries = Object.entries(lc);
  if (entries.length > LIMITS.lines) return { bad: "line colours" };
  const lineColours: Record<number, string> = {};
  for (const [key, colour] of entries) {
    const line = Number(key);
    if (!/^\d{1,3}$/.test(key) || line >= LIMITS.lines || !isHexColour(colour)) return { bad: "line colours" };
    lineColours[line] = colour.toUpperCase();
  }

  if (ec !== null && !isHexColour(ec)) return { bad: "emphasis colour" };
  return {
    look: { background, pattern: pt as PatternId, patternStrength: Math.round(ps), lineColours, emphasisColour: ec === null ? null : ec.toUpperCase() },
    notices,
  };
}

function validate(raw: Record<string, unknown>, version: number): Checked {
  const core = validateCore(raw);
  if ("bad" in core) return core;
  // A version 1 link has none of the newer fields: ignore any that happen to be there and use the defaults.
  const look = validateLook(version >= 2 ? raw : {});
  if ("bad" in look) return look;
  return { state: { ...core.core, ...look.look }, notices: look.notices };
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

  const version = raw.v;
  if (version !== 1 && version !== SHARE_VERSION) {
    return failure(
      "version",
      "That link was made with a different version of Stanza, so the settings can't be restored.",
      recoverablePoem(raw),
    );
  }

  const checked = validate(raw, version);
  if ("bad" in checked) {
    return failure("invalid", `That link has a problem with its ${checked.bad}, so the settings can't be restored.`, recoverablePoem(raw));
  }
  return { ok: true, state: checked.state, version, notices: checked.notices };
}

/** "#p=..." for a state. */
export const shareHash = (state: ShareState): string => `#${HASH_KEY}=${encodeShare(state)}`;

/** The payload of a "#p=..." hash, or null if the hash is something else. */
export function readShareHash(hash: string): string | null {
  const match = new RegExp(`^#?${HASH_KEY}=(.*)$`, "s").exec(hash ?? "");
  return match ? match[1] : null;
}
