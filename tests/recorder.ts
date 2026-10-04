import type { PatternContext } from "@/lib/render/patterns";
import type { FooterLine, Layout } from "@/lib/render/types";
import type { FrameContext } from "@/lib/render/renderFrame";

export interface DrawCall {
  op: "save" | "restore" | "translate" | "scale" | "fillRect" | "fillText" | "drawImage";
  args: unknown[];
  /** Canvas state at the moment of the call. */
  alpha: number;
  fill: string;
  font: string;
  textAlign: CanvasTextAlign;
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetX: number;
}

interface DrawingState {
  fillStyle: string;
  font: string;
  globalAlpha: number;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetX: number;
}

/**
 * A fake 2D context that logs every draw call with its arguments and the state it was made in.
 * No native canvas needed, so purity tests run in plain Node.
 */
export class RecordingContext {
  readonly calls: DrawCall[] = [];
  fillStyle = "#000";
  font = "10px sans-serif";
  globalAlpha = 1;
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  shadowBlur = 0;
  shadowColor = "rgba(0, 0, 0, 0)";
  shadowOffsetX = 0;
  private stack: DrawingState[] = [];

  private state(): DrawingState {
    const { fillStyle, font, globalAlpha, textAlign, textBaseline, shadowBlur, shadowColor, shadowOffsetX } = this;
    return { fillStyle, font, globalAlpha, textAlign, textBaseline, shadowBlur, shadowColor, shadowOffsetX };
  }

  private record(op: DrawCall["op"], args: unknown[]) {
    this.calls.push({
      op,
      args,
      alpha: this.globalAlpha,
      fill: String(this.fillStyle),
      font: this.font,
      textAlign: this.textAlign,
      shadowBlur: this.shadowBlur,
      shadowColor: this.shadowColor,
      shadowOffsetX: this.shadowOffsetX,
    });
  }

  // Like a real canvas, save() snapshots the drawing state and restore() puts it back.
  save() {
    this.record("save", []);
    this.stack.push(this.state());
  }
  restore() {
    this.record("restore", []);
    const saved = this.stack.pop();
    if (saved) Object.assign(this, saved);
  }
  translate(...args: number[]) {
    this.record("translate", args);
  }
  scale(...args: number[]) {
    this.record("scale", args);
  }
  fillRect(...args: number[]) {
    this.record("fillRect", args);
  }
  fillText(...args: unknown[]) {
    this.record("fillText", args);
  }
  drawImage(...args: unknown[]) {
    this.record("drawImage", args);
  }

  /** Everything observable, as one string: equal strings mean identical drawing. */
  transcript(): string {
    return JSON.stringify(this.calls);
  }

  asContext(): FrameContext {
    return this as unknown as FrameContext;
  }

  texts(): DrawCall[] {
    return this.calls.filter((c) => c.op === "fillText");
  }

  rects(): DrawCall[] {
    return this.calls.filter((c) => c.op === "fillRect");
  }
}

/** "text|x" for every piece of the title block and footer, glyph by glyph: how to tell them from the poem's own text. */
export function footerKeys(layout: Layout): Set<string> {
  const keys = new Set<string>();
  for (const line of [...(layout.title ? [layout.title] : []), ...layout.footer]) {
    if (line.glyphs) for (const g of line.glyphs) keys.add(`${g.text}|${g.x}`);
    else keys.add(`${line.text}|${line.x}`);
  }
  keys.add(`${layout.mark.text}|${layout.mark.x}`); // the "made with Stanza" mark is not poem text either
  return keys;
}

/** The poem's own fillText calls: the title above it and the footer are filtered out. */
export function poemCalls(ctx: RecordingContext, scene: { layout: Layout }): DrawCall[] {
  const skip = footerKeys(scene.layout);
  return ctx.texts().filter((call) => !skip.has(`${call.args[0]}|${call.args[1]}`));
}

/** The calls that draw one footer or title line (tracked lines are one call per character). */
export function callsOfLine(ctx: RecordingContext, line: FooterLine): DrawCall[] {
  return ctx.texts().filter((call) => call.font === line.font && call.args[2] === line.y);
}

/** The text a footer or title line actually put on the canvas. */
export const drawnText = (ctx: RecordingContext, line: FooterLine): string => callsOfLine(ctx, line).map((c) => String(c.args[0])).join("");

export interface PathCall {
  op: "save" | "restore" | "beginPath" | "closePath" | "moveTo" | "lineTo" | "arc" | "rect" | "clip" | "stroke" | "fill";
  args: unknown[];
  alpha: number;
  stroke: string;
  fill: string;
  lineWidth: number;
}

/** A fake 2D context for the background patterns: logs every path call with the state it was made in. */
export class PathRecorder {
  readonly calls: PathCall[] = [];
  strokeStyle = "#000";
  fillStyle = "#000";
  globalAlpha = 1;
  lineWidth = 1;
  lineCap: CanvasLineCap = "butt";
  private stack: { strokeStyle: string; fillStyle: string; globalAlpha: number; lineWidth: number; lineCap: CanvasLineCap }[] = [];

  private record(op: PathCall["op"], args: unknown[] = []) {
    this.calls.push({ op, args, alpha: this.globalAlpha, stroke: String(this.strokeStyle), fill: String(this.fillStyle), lineWidth: this.lineWidth });
  }
  save() {
    this.record("save");
    const { strokeStyle, fillStyle, globalAlpha, lineWidth, lineCap } = this;
    this.stack.push({ strokeStyle: String(strokeStyle), fillStyle: String(fillStyle), globalAlpha, lineWidth, lineCap });
  }
  restore() {
    this.record("restore");
    const saved = this.stack.pop();
    if (saved) Object.assign(this, saved);
  }
  beginPath() {
    this.record("beginPath");
  }
  closePath() {
    this.record("closePath");
  }
  moveTo(...args: number[]) {
    this.record("moveTo", args);
  }
  lineTo(...args: number[]) {
    this.record("lineTo", args);
  }
  arc(...args: number[]) {
    this.record("arc", args);
  }
  rect(...args: number[]) {
    this.record("rect", args);
  }
  clip() {
    this.record("clip");
  }
  stroke() {
    this.record("stroke");
  }
  fill() {
    this.record("fill");
  }
  transcript() {
    return JSON.stringify(this.calls);
  }
  asContext(): PatternContext {
    return this as unknown as PatternContext;
  }
  /** Every x,y the pattern touches (moveTo, lineTo, rect corners, arc centres with their radius). */
  points(): { x: number; y: number; pad: number }[] {
    const out: { x: number; y: number; pad: number }[] = [];
    for (const c of this.calls) {
      const a = c.args as number[];
      if (c.op === "moveTo" || c.op === "lineTo") out.push({ x: a[0], y: a[1], pad: 0 });
      else if (c.op === "rect") out.push({ x: a[0], y: a[1], pad: 0 }, { x: a[0] + a[2], y: a[1] + a[3], pad: 0 });
      else if (c.op === "arc") out.push({ x: a[0], y: a[1], pad: a[2] });
    }
    return out;
  }
}
