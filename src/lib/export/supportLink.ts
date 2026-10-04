// PURE: the optional "buy me a chai" link. NEXT_PUBLIC_SUPPORT_URL is a public link on purpose (it is shown to everyone).

/** The link to show, or null (hide the whole thing) when it is unset, blank or not a web address. */
export function supportLink(raw: string | undefined | null): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
