// Request-shape checks for /api/analyze that need no Gemini and no dictionary, so they are cheap to test and cheap to run.

/** Poems are at most 2000 characters; even all escaped control characters stay far below this. */
export const MAX_BODY_BYTES = 16 * 1024;

/** True for "application/json" with or without parameters ("; charset=utf-8"), in any letter case. Nothing else counts. */
export function isJsonContentType(header: string | null): boolean {
  if (!header) return false;
  return header.split(";")[0].trim().toLowerCase() === "application/json";
}

export type BodyRead = { ok: true; text: string } | { ok: false; reason: "too_large" | "unreadable" };

/**
 * Reads the body as text but gives up as soon as it passes `maxBytes`, so a client that lies about (or leaves out)
 * Content-Length cannot make the server buffer a huge upload. Counts bytes, not characters.
 */
export async function readBodyLimited(request: Request, maxBytes: number = MAX_BODY_BYTES): Promise<BodyRead> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}
