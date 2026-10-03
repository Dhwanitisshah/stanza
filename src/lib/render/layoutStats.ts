// PURE: summary numbers about a layout, for tests, the CLI and the dev tools.
import type { Layout } from "./types";

export interface LayoutStats {
  fontSize: number;
  pages: number;
  lines: number;
  /** Poem lines that needed more than one row. */
  wrappedLines: number;
}

export function layoutStats(layout: Layout): LayoutStats {
  const rowsOfLine = new Map<number, Set<number>>();
  for (const page of layout.pages) {
    for (const word of page.words) {
      const rows = rowsOfLine.get(word.lineIndex) ?? new Set<number>();
      for (const piece of word.pieces) rows.add(Math.round(piece.y * 100));
      rowsOfLine.set(word.lineIndex, rows);
    }
  }
  let wrappedLines = 0;
  for (const rows of rowsOfLine.values()) if (rows.size > 1) wrappedLines++;
  return { fontSize: layout.fontSize, pages: layout.pages.length, lines: rowsOfLine.size, wrappedLines };
}
