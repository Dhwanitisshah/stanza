// Prints the timeline of a fixture poem as a table, so you can eyeball the rhythm.
// Text widths use a fake monospace font (0.6 em per character), so font size and page count are only
// approximate here; the TIMING is exact because it does not depend on text width.
import { fallbackAnalysis } from "@/lib/ai/fallback";
import { analyzePoem, toPublicProsody } from "@/lib/prosody";
import { buildScene } from "@/lib/render/scene";
import type { FormatId, MeasureText, TimelineEvent } from "@/lib/render/types";
import { FIXTURES } from "../tests/fixtures/poems";

const monospace: MeasureText = (text, font) => text.length * Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16) * 0.6;

const pad = (value: string | number, width: number) => String(value).padEnd(width);
const padLeft = (value: string | number, width: number) => String(value).padStart(width);

function parseArgs(args: string[]) {
  const flags = new Map(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=") as [string, string]));
  const name = args.find((a) => !a.startsWith("--"));
  const format = (flags.get("format") ?? "reel") as FormatId;
  const speed = Number(flags.get("speed") ?? 1);
  return { name, format, speed };
}

export function main(args: string[]): number {
  const { name, format, speed } = parseArgs(args);
  const poem = name ? FIXTURES[name] : undefined;
  if (poem === undefined || (format !== "reel" && format !== "post") || !Number.isFinite(speed)) {
    console.error(`Usage: npm run timeline -- <fixture> [--speed=1] [--format=reel|post]\nFixtures: ${Object.keys(FIXTURES).join(", ")}`);
    return 1;
  }

  const prosody = toPublicProsody(analyzePoem(poem));
  const analysis = fallbackAnalysis(prosody);
  const scene = buildScene({ prosody, analysis, format, speed, measureText: monospace });
  const { events, totalMs } = scene.timeline;

  const words = new Map(prosody.stanzas.flatMap((s) => s.lines.flatMap((l) => l.words.map((w) => [w.id, w] as const))));
  const textOf = (id: string) => words.get(id)?.text ?? id;
  const echoes = events.filter((e): e is Extract<TimelineEvent, { type: "echo" }> => e.type === "echo");

  const rows: string[] = [];
  const appear = events.filter((e): e is Extract<TimelineEvent, { type: "appear" }> => e.type === "appear");
  const nextStart = (i: number) => (i + 1 < appear.length ? appear[i + 1].start : undefined);

  for (const event of events) {
    if (event.type === "stanza-dim") {
      rows.push(`  -- stanza ${event.stanzaIndex} dims to ${event.toOpacity * 100}% at ${event.start} ms --`);
    } else if (event.type === "page") {
      rows.push(`  == page ${event.pageIndex} at ${event.start} ms ==`);
    } else if (event.type === "appear") {
      const i = appear.indexOf(event);
      const next = nextStart(i);
      const pause = next === undefined ? "-" : next - (event.start + event.duration);
      const pulses = echoes.filter((e) => e.wordId === event.wordId).map((e) => `pulses @${e.start} (${e.strength})`);
      const triggers = echoes.filter((e) => e.triggerWordId === event.wordId).map((e) => `echoes "${textOf(e.wordId)}"`);
      const stress = words.get(event.wordId)?.stress ?? "";
      rows.push(
        [
          pad(textOf(event.wordId), 18),
          padLeft(event.start, 8),
          padLeft(event.duration, 9),
          padLeft(pause, 7),
          pad(stress, 8),
          pad(event.isEmphasis ? "EMPH" : "", 6),
          [...pulses, ...triggers].join("; "),
        ].join("  "),
      );
    }
  }

  console.log(`fixture: ${name}   mood: ${scene.mood.id} (beat ${scene.mood.beatMs} ms)   speed: ${speed}   format: ${format}`);
  console.log(`scheme: ${prosody.scheme}   words: ${prosody.wordCount}   syllables: ${prosody.syllableCount}\n`);
  console.log(
    [pad("word", 18), padLeft("start ms", 8), padLeft("dur ms", 9), padLeft("pause", 7), pad("stress", 8), pad("emph", 6), "echo"].join("  "),
  );
  console.log("-".repeat(86));
  rows.forEach((r) => console.log(r));
  console.log("-".repeat(86));
  console.log(`totalMs: ${totalMs}  (${(totalMs / 1000).toFixed(1)} s)   pages: ${scene.layout.pages.length}   font: ${scene.layout.fontSize}px (approx., fake metrics)`);
  return 0;
}
