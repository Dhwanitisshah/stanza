// Shared Tailwind class strings. Deliberately NOT a "use client" file: server components (the 404 page) import these
// as plain strings. A constant imported from a client module reaches a server component as an unusable client
// reference, which silently left the 404 button unstyled.
export const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45";
export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-ink text-paper hover:bg-black`;
export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-ink/70 bg-transparent text-ink hover:bg-ink/5`;
export const FIELD = "w-full rounded-md border border-rule bg-field px-3 text-ink placeholder:text-muted/80";
