import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { SiteFooter } from "./SiteFooter";

/** The frame for the quiet pages (privacy, not found): the logo, a column of text, the footer. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-rule px-5 py-4 sm:px-8">
        <Link href="/" aria-label="Stanza, back to the start" className="inline-flex min-h-11 items-center rounded-md">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-[44rem] flex-1 px-5 py-12 sm:px-8 sm:py-16">{children}</main>
      <SiteFooter />
    </div>
  );
}
