import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, generateNonce } from "@/lib/security/csp";

// Runs before every page request. It makes a fresh nonce, puts it in the Content-Security-Policy header, and passes it
// on to the page (Next reads it from the request's CSP header and stamps it on the inline scripts it writes).
// Because a nonce must be new for every request, every page is rendered per request (see connection() in layout.tsx).
export function proxy(request: NextRequest) {
  const csp = buildCsp({ nonce: generateNonce(), dev: process.env.NODE_ENV === "development" });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only. Not the API (JSON), Next's static files, or the icons, manifest and share image in /public.
      source: "/((?!api|_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|webp|webmanifest|txt|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
