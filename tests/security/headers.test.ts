import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import nextConfig, { securityHeaders } from "../../next.config";
import { proxy, config as proxyConfig } from "@/proxy";
import { buildCsp, generateNonce } from "@/lib/security/csp";
import { analyticsEnabled, cleanEvent, stripToPath } from "@/lib/analytics";
import { siteUrl } from "@/lib/site";

const directives = (csp: string) => Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]));

describe("buildCsp", () => {
  const csp = directives(buildCsp({ nonce: "abc123" }));

  it("allows only our own origin by default", () => {
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["connect-src"]).toEqual(["'self'"]);
    expect(csp["font-src"]).toEqual(["'self'"]);
  });

  it("allows images from self, blob: and data:, and workers from self and blob:", () => {
    expect(csp["img-src"]).toEqual(["'self'", "blob:", "data:"]);
    expect(csp["worker-src"]).toEqual(["'self'", "blob:"]);
  });

  it("scripts need this request's nonce; no unsafe-inline and no eval in production", () => {
    expect(csp["script-src"]).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
  });

  it("only development adds unsafe-eval (React's error overlay needs it)", () => {
    expect(directives(buildCsp({ nonce: "n", dev: true }))["script-src"]).toContain("'unsafe-eval'");
    expect(directives(buildCsp({ nonce: "n", dev: false }))["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("forbids framing, plugins, and a changed base URL; forms post only to us", () => {
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
  });

  it("never allows any other origin: no host names, wildcards or https: sources anywhere", () => {
    for (const [name, sources] of Object.entries(csp)) {
      for (const source of sources) {
        expect(source, `${name} ${source}`).toMatch(/^('self'|'none'|'strict-dynamic'|'unsafe-inline'|'nonce-[^']+'|blob:|data:)$/);
      }
    }
  });

  it("is the one place 'unsafe-inline' appears, and only for styles (React's style attributes)", () => {
    const withInline = Object.entries(csp).filter(([, sources]) => sources.includes("'unsafe-inline'")).map(([name]) => name);
    expect(withInline).toEqual(["style-src"]);
  });
});

describe("generateNonce", () => {
  it("is new every time, base64, and cannot break out of the header", () => {
    const nonces = new Set(Array.from({ length: 200 }, generateNonce));
    expect(nonces.size).toBe(200);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/); // 16 random bytes
  });
});

describe("static security headers (next.config)", () => {
  const byKey = Object.fromEntries(securityHeaders.map((h) => [h.key, h.value]));

  it("sets nosniff, the referrer policy, and turns off camera, microphone and geolocation", () => {
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("also forbids framing for old browsers and asks for https", () => {
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Strict-Transport-Security"]).toMatch(/^max-age=\d+/);
  });

  it("does not put the Content-Security-Policy here (it needs a nonce per request, so the proxy sets it)", () => {
    expect(byKey["Content-Security-Policy"]).toBeUndefined();
  });

  it("applies to every path, and hides the framework banner", async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toEqual([{ source: "/:path*", headers: securityHeaders }]);
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe("proxy", () => {
  const get = (path = "/") => proxy(new NextRequest(`http://localhost${path}`));

  it("sets the CSP on the response with a nonce", () => {
    const csp = get().headers.get("content-security-policy") ?? "";
    expect(directives(csp)["script-src"].some((s) => /^'nonce-.+'$/.test(s))).toBe(true);
  });

  it("uses a different nonce on every request", () => {
    const nonce = (r: Response) => /'nonce-([^']+)'/.exec(r.headers.get("content-security-policy") ?? "")?.[1];
    expect(nonce(get())).not.toBe(nonce(get()));
  });

  it("forwards the same policy to the page as a request header, which is how Next finds the nonce to stamp on its scripts", () => {
    const response = get();
    const forwarded = response.headers.get("x-middleware-request-content-security-policy");
    expect(forwarded).toBe(response.headers.get("content-security-policy"));
  });

  it("covers pages, not the API, Next's files or the icons and share image", () => {
    const [{ source }] = proxyConfig.matcher;
    const re = new RegExp(`^${source}$`);
    for (const page of ["/", "/privacy", "/anything-else"]) expect(re.test(page), page).toBe(true);
    for (const skipped of ["/api/analyze", "/_next/static/chunks/a.js", "/_next/image", "/og.jpg", "/icon-192.png", "/favicon.ico", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml"]) {
      expect(re.test(skipped), skipped).toBe(false);
    }
  });
});

describe("analytics", () => {
  it("is off unless NEXT_PUBLIC_ANALYTICS is exactly true", () => {
    expect(analyticsEnabled({})).toBe(false);
    for (const off of ["", "false", "0", "1", "yes", "on"]) expect(analyticsEnabled({ NEXT_PUBLIC_ANALYTICS: off })).toBe(false);
    for (const on of ["true", "TRUE", " true "]) expect(analyticsEnabled({ NEXT_PUBLIC_ANALYTICS: on })).toBe(true);
  });

  it("never lets a share link's poem leave the browser: the #hash and ?query are cut from every address", () => {
    expect(stripToPath("https://stanza.app/#p=NobwRAdghgtgpmAXGaBLEATAghgJ")).toBe("https://stanza.app/");
    expect(stripToPath("https://stanza.app/privacy?x=1#top")).toBe("https://stanza.app/privacy");
    expect(stripToPath("https://stanza.app/")).toBe("https://stanza.app/");
  });

  it("cleans pageviews and custom events alike, and keeps everything else about the event", () => {
    expect(cleanEvent({ type: "pageview" as const, url: "https://s.app/#p=secret poem" })).toEqual({ type: "pageview", url: "https://s.app/" });
    expect(cleanEvent({ type: "event" as const, url: "https://s.app/?q=1#p=secret" })).toEqual({ type: "event", url: "https://s.app/" });
  });
});

describe("siteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL, then Vercel's production domain, then localhost; no trailing slash", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://stanza.example/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe("https://stanza.example");
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "stanza.vercel.app" })).toBe("https://stanza.vercel.app");
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "https://stanza.vercel.app/" })).toBe("https://stanza.vercel.app");
    expect(siteUrl({})).toBe("http://localhost:3000");
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "   " })).toBe("http://localhost:3000");
  });
});
