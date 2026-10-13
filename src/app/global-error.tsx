"use client";

// The last resort: used when the root layout itself fails, so it replaces the whole document and cannot rely on the
// app's stylesheet, fonts or components. Plain inline styles only; the paper colour and ink match the app.
export default function GlobalError() {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#F4EFE6", color: "#1C1A17", fontFamily: "Georgia, serif" }}>
        <main style={{ maxWidth: "40rem", margin: "0 auto", padding: "4rem 1.25rem" }}>
          <p style={{ margin: 0, fontFamily: "system-ui, sans-serif", fontSize: "0.75rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#8F2D16" }}>Something broke</p>
          <h1 style={{ margin: "1rem 0 0", fontSize: "2.75rem", lineHeight: 1.05, fontWeight: 400 }}>
            That line <em>didn&apos;t land.</em>
          </h1>
          <p style={{ margin: "1.5rem 0 0", fontFamily: "system-ui, sans-serif", fontSize: "1.0625rem", lineHeight: 1.7 }}>
            Stanza hit a problem it couldn&apos;t recover from. You can start again, and any share link you copied earlier still works.
          </p>
          {/* A plain link on purpose: a full page load clears whatever state broke. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{ display: "inline-flex", alignItems: "center", minHeight: "2.75rem", marginTop: "2rem", padding: "0 1.5rem", background: "#1C1A17", color: "#F4EFE6", borderRadius: "6px", fontFamily: "system-ui, sans-serif", fontSize: "0.875rem", fontWeight: 500, textDecoration: "none" }}
          >
            Start again
          </a>
        </main>
      </body>
    </html>
  );
}
