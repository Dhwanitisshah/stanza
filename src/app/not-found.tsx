import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { BUTTON_PRIMARY } from "@/components/styles";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <PageShell>
      <p className="eyebrow !text-accent">404</p>
      <h1 className="mt-4 font-serif text-[clamp(2.5rem,7vw,3.75rem)] leading-[1] tracking-tight">
        This page <em className="italic">is a blank line.</em>
      </h1>
      <p className="mt-6 text-lg leading-8 text-ink/90">There is nothing written here. The address may have a typo, or the page may have moved.</p>
      <Link href="/" className={`${BUTTON_PRIMARY} mt-8 px-6`}>
        Start again
      </Link>
    </PageShell>
  );
}
