import type { FrameContext } from "@/lib/render/renderFrame";

export interface DrawCall {
  op: "save" | "restore" | "fillRect" | "fillText" | "drawImage";
  args: unknown[];
  /** Canvas state at the moment of the call. */
  alpha: number;
  fill: string;
  font: string;
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
  private stack: { fillStyle: string; font: string; globalAlpha: number; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline }[] = [];

  private record(op: DrawCall["op"], args: unknown[]) {
    this.calls.push({ op, args, alpha: this.globalAlpha, fill: String(this.fillStyle), font: this.font });
  }

  // Like a real canvas, save() snapshots the drawing state and restore() puts it back.
  save() {
    this.record("save", []);
    const { fillStyle, font, globalAlpha, textAlign, textBaseline } = this;
    this.stack.push({ fillStyle, font, globalAlpha, textAlign, textBaseline });
  }
  restore() {
    this.record("restore", []);
    const saved = this.stack.pop();
    if (saved) Object.assign(this, saved);
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
}
