import Link from "next/link";
import { REPO_URL } from "@/lib/site";

const LINK = "inline-flex min-h-11 items-center underline underline-offset-4";

export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3 text-sm text-muted sm:px-8">
        <p>Stanza never writes a word. It performs yours.</p>
        <nav aria-label="Site" className="flex items-center gap-5">
          <Link href="/privacy" className={LINK}>
            Privacy
          </Link>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
            Source on GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
