import { describe, expect, it } from "vitest";
import { TENDER } from "@/lib/moods/presets";
import type { AppearEvent, EchoEvent, PageEvent, StanzaDimEvent, Timeline } from "@/lib/render/types";
import { TIMING } from "@/lib/timeline/config";
import { buildTimeline, spokenBeats } from "@/lib/timeline/buildTimeline";
import { ABAB, EDGE_CASES, LAMP_ABAB, LETTERS_AABB, TRAFFIC_FREE_VERSE } from "../fixtures/poems";
import { prepare, wordIds } from "../helpers";

const build = (poem: string, speed = 1, pageOfLine?: number[], emphasis?: string[]) => {
  const { prosody, analysis } = prepare(poem);
  const timeline = buildTimeline(prosody, { emphasis: emphasis ?? analysis.emphasis }, TENDER, speed, pageOfLine);
  return { prosody, timeline };
};
const appears = (timeline: Timeline) => timeline.events.filter((e): e is AppearEvent => e.type === "appear");
const ms = (beats: number) => Math.round(beats * TENDER.beatMs);

/** Silence between the end of word i and the start of word i + 1. */
const gaps = (timeline: Timeline) => {
  const a = appears(timeline);
  return a.slice(0, -1).map((e, i) => a[i + 1].start - (e.start + e.duration));
};

describe("buildTimeline: basics", () => {
  it("is deterministic", () => {
    expect(build(LAMP_ABAB).timeline).toEqual(build(LAMP_ABAB).timeline);
  });

  it("gives every word exactly one appear event, in poem order", () => {
    for (const poem of [LAMP_ABAB, ABAB, LETTERS_AABB, TRAFFIC_FREE_VERSE, "a\n\nb\n\nc"]) {
      const { prosody, timeline } = build(poem);
      expect(appears(timeline).map((e) => e.wordId)).toEqual(wordIds(prosody));
    }
  });

  it("uses integer milliseconds, sorted by start", () => {
    const { timeline } = build(ABAB, 1.3);
    expect(Number.isInteger(timeline.totalMs)).toBe(true);
    for (const e of timeline.events) {
      expect(Number.isInteger(e.start)).toBe(true);
      expect(Number.isInteger(e.duration)).toBe(true);
    }
    const starts = timeline.events.map((e) => e.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("starts after the lead-in and ends with the final hold", () => {
    const { timeline } = build("moon");
    const [only] = appears(timeline);
    expect(only.start).toBe(TIMING.leadInMs);
    expect(timeline.totalMs).toBe(only.start + only.duration + TIMING.finalHoldMs);
  });

  it("copes with empty and word-free input", () => {
    for (const poem of ["", "...", EDGE_CASES.emoji, EDGE_CASES.veryLongWord, EDGE_CASES.manyLines]) {
      expect(() => build(poem)).not.toThrow();
    }
    expect(build("").timeline).toEqual({ events: [], totalMs: TIMING.leadInMs + TIMING.finalHoldMs });
  });
});

describe("buildTimeline: stress", () => {
  it("makes stressed syllables longer than unstressed ones", () => {
    const [the, moon] = appears(build("the moon", 1, undefined, []).timeline); // no emphasis
    expect(moon.duration).toBeGreaterThan(the.duration);
    expect(the.duration).toBe(ms(TIMING.unstressedMultiplier));
    expect(moon.duration).toBe(ms(TIMING.stressedMultiplier));
  });

  it("sums the beats of each syllable (daffodils = stress 102)", () => {
    const word = prepare("daffodils").prosody.stanzas[0].lines[0].words[0];
    expect(word.stress).toBe("102");
    expect(spokenBeats(word)).toBeCloseTo(TIMING.stressedMultiplier + TIMING.unstressedMultiplier + TIMING.secondaryMultiplier);
  });

  it("holds emphasis words longer", () => {
    const moonId = prepare("the moon").prosody.stanzas[0].lines[0].words[1].id;
    const plain = appears(build("the moon", 1, undefined, []).timeline)[1];
    const held = appears(build("the moon", 1, undefined, [moonId]).timeline)[1];
    expect(held.isEmphasis).toBe(true);
    expect(plain.isEmphasis).toBe(false);
    expect(held.duration - plain.duration).toBe(ms(TIMING.emphasisHoldBeats));
  });
});

describe("buildTimeline: pauses", () => {
  it("keeps the configured pauses in order: comma < medium < long < line < stanza", () => {
    const p = TIMING.pauseBeats;
    expect(p.comma).toBeLessThan(p.medium);
    expect(p.medium).toBeLessThan(p.long);
    expect(p.long).toBeLessThan(p.line);
    expect(p.line).toBeLessThan(p.stanza);
  });

  it("produces gaps that follow that order in the timeline", () => {
    // Every word is "go" (same duration), so only the pause differs.
    const [comma, medium, long, none, line, stanza] = gaps(build("go, go; go. go go\ngo\n\ngo").timeline);

    expect(none).toBe(0);
    expect(comma).toBe(ms(TIMING.pauseBeats.comma));
    expect(medium).toBe(ms(TIMING.pauseBeats.medium));
    expect(long).toBe(ms(TIMING.pauseBeats.long));
    expect(line).toBe(ms(TIMING.pauseBeats.line));
    expect(stanza).toBe(ms(TIMING.pauseBeats.stanza));

    expect(none).toBeLessThan(comma);
    expect(comma).toBeLessThan(medium);
    expect(medium).toBeLessThan(long);
    expect(long).toBeLessThan(line);
    expect(line).toBeLessThan(stanza);
  });

  it("adds punctuation to the line break, but a stanza break replaces the line break", () => {
    const [afterLine, afterStanza] = gaps(build("go.\ngo.\n\ngo").timeline);
    expect(afterLine).toBe(ms(TIMING.pauseBeats.long) + ms(TIMING.pauseBeats.line));
    expect(afterStanza).toBe(ms(TIMING.pauseBeats.long) + ms(TIMING.pauseBeats.stanza));
  });

  it("reads the strongest punctuation: dashes, ellipses, quotes", () => {
    const [dash, ellipsis, quoted] = gaps(build('go— go... go," go').timeline);
    expect(dash).toBe(ms(TIMING.pauseBeats.medium));
    expect(ellipsis).toBe(ms(TIMING.pauseBeats.long));
    expect(quoted).toBe(ms(TIMING.pauseBeats.comma));
  });
});

describe("buildTimeline: speed", () => {
  it("grows totalMs as speed drops", () => {
    const totals = [3, 2, 1, 0.5, 0.25].map((speed) => build(LAMP_ABAB, speed).timeline.totalMs);
    for (let i = 1; i < totals.length; i++) expect(totals[i]).toBeGreaterThan(totals[i - 1]);
  });

  it("scales beats but not the fixed lead-in", () => {
    const fast = appears(build("go, go", 2).timeline);
    const slow = appears(build("go, go", 1).timeline);
    expect(fast[0].start).toBe(TIMING.leadInMs);
    expect(slow[0].start).toBe(TIMING.leadInMs);
    expect(fast[0].duration).toBeLessThan(slow[0].duration);
  });

  it("clamps or defaults silly speeds instead of throwing", () => {
    for (const speed of [0, -1, NaN, Infinity, 1e9]) {
      expect(Number.isFinite(build(LAMP_ABAB, speed).timeline.totalMs)).toBe(true);
    }
  });
});

describe("buildTimeline: echoes, stanza dims, pages", () => {
  it("emits an echo for each rhyme pair: the earlier word pulses when the later one lands", () => {
    const { prosody, timeline } = build(LAMP_ABAB);
    const echoes = timeline.events.filter((e): e is EchoEvent => e.type === "echo");
    const ends = prosody.stanzas[0].lines.map((l) => l.words[l.words.length - 1].id);
    const startOf = (id: string) => appears(timeline).find((e) => e.wordId === id)!.start;

    expect(echoes.map((e) => [e.wordId, e.triggerWordId])).toEqual([
      [ends[0], ends[2]],
      [ends[1], ends[3]],
    ]);
    for (const e of echoes) {
      expect(e.start).toBe(startOf(e.triggerWordId));
      expect(e.start).toBeGreaterThan(startOf(e.wordId));
      expect(e.strength).toBe("perfect");
    }
  });

  it("carries near and repeat strength through", () => {
    const strengths = (poem: string) =>
      build(poem)
        .timeline.events.filter((e): e is EchoEvent => e.type === "echo")
        .map((e) => e.strength);
    expect(strengths("I watched the passing time\nAnd wished that you were mine")).toEqual(["near"]);
    expect(strengths("Take me away to a brand new day\nAnd let me be as I was that day")).toEqual(["repeat"]);
  });

  it("tags rhyming line-end words with their rhyme group", () => {
    const groups = appears(build(LAMP_ABAB).timeline).filter((e) => e.rhymeGroup);
    expect(groups.map((e) => e.rhymeGroup)).toEqual(["A", "B", "A", "B"]);
  });

  it("emits a stanza-dim at each stanza break, during the pause", () => {
    const { timeline } = build("one two\nthree\n\nfour five");
    const dims = timeline.events.filter((e): e is StanzaDimEvent => e.type === "stanza-dim");
    expect(dims).toHaveLength(1);
    expect(dims[0]).toMatchObject({ stanzaIndex: 0, toOpacity: TIMING.stanzaDimTo, duration: TIMING.stanzaDimMs });

    const a = appears(timeline);
    expect(dims[0].start).toBeGreaterThanOrEqual(a[2].start + a[2].duration);
    expect(dims[0].start).toBeLessThan(a[3].start);
  });

  it("emits a page event, and waits for the transition, when a line moves to a new page", () => {
    const { timeline } = build("a b\nc d\ne f\ng h", 1, [0, 0, 1, 1]);
    const pages = timeline.events.filter((e): e is PageEvent => e.type === "page");
    expect(pages).toHaveLength(1);
    expect(pages[0].pageIndex).toBe(1);

    const a = appears(timeline);
    expect(pages[0].start).toBeGreaterThanOrEqual(a[3].start + a[3].duration);
    expect(a[4].start).toBeGreaterThanOrEqual(pages[0].start + TIMING.pageTransitionMs);
  });

  it("emits no page events for a single page", () => {
    expect(build(ABAB).timeline.events.some((e) => e.type === "page")).toBe(false);
  });
});
