// PURE: file names for exports: stanza-<title-slug or first words>.<ext>

const MAX_SLUG_CHARS = 40;
const FIRST_WORDS = 5;

/** "A Patient Moon!" -> "a-patient-moon". Accents are folded (é -> e); anything else that is not a letter or digit is a dash. */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "") // "moon's" -> "moons", not "moon-s"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= MAX_SLUG_CHARS) return slug;
  // Cut at a word boundary where there is one, so the name never ends in half a word.
  const cut = slug.slice(0, MAX_SLUG_CHARS);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash >= MAX_SLUG_CHARS / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

export type ExportExtension = "mp4" | "webm" | "png" | "jpg";

/**
 * stanza-<slug>.<ext>. The slug is the title when there is one, otherwise the first words of the poem,
 * otherwise "poem" (a poem made only of symbols still gets a sensible name).
 */
export function exportFilename(source: { title?: string; poem: string }, extension: ExportExtension): string {
  const fromTitle = slugify(source.title ?? "");
  const fromPoem = slugify(source.poem.split(/\s+/).filter(Boolean).slice(0, FIRST_WORDS).join(" "));
  return `stanza-${fromTitle || fromPoem || "poem"}.${extension}`;
}
