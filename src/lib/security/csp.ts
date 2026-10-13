// The Content-Security-Policy, built as a pure function so a test can read it directive by directive.
// proxy.ts calls this once per request with a fresh nonce.
//
// What each directive is for, in plain words:
//   default-src 'self'      anything not listed below may only come from our own origin
//   script-src              our own scripts, plus the inline scripts Next itself writes into the page, which carry this
//                           request's nonce. 'strict-dynamic' lets a nonce'd script load the chunks it needs, and makes the
//                           browser ignore host lists and 'unsafe-inline': an injected <script> without the nonce does not run.
//   style-src 'unsafe-inline'   React writes style="..." attributes (the poster thumbnails, the colour swatches) and a
//                           nonce cannot cover an attribute. Styles are the weaker half of the risk: they cannot run code.
//                           This is the one place the policy is looser than I would like, and it is deliberate.
//   img-src self blob: data:    the photo background and the pattern/grain canvases are blobs and data URLs
//   worker-src self blob:       workers made from a blob (nothing uses one today; allowed so a library can)
//   connect-src 'self'      fetch/XHR/WebSocket only to us: the only call the page makes is POST /api/analyze
//   frame-ancestors 'none'  nobody may put Stanza in an iframe (clickjacking)
//   object-src 'none', base-uri 'self', form-action 'self'   the usual closing of old doors

export interface CspOptions {
  nonce: string;
  /** `next dev` needs eval for React's error overlay and stack rebuilding; production does not. */
  dev?: boolean;
}

/** A fresh, unguessable, one-request-only value. 16 random bytes, base64. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp({ nonce, dev = false }: CspOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "connect-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}
