import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { analyticsEnabled } from "@/lib/analytics";
import { REPO_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What happens to your poem, your photos and your share links in Stanza, in plain English.",
  alternates: { canonical: "/privacy" },
};

const A = "underline underline-offset-4";
/** A link that sits on its own line, so it can be a full 44px touch target. */
const A_BLOCK = "inline-flex min-h-11 items-center underline underline-offset-4";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <h2 id={id} className="font-serif text-3xl leading-tight">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4 text-base leading-7 text-ink/90">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  // Read when the page is rendered, from the same switch that decides whether the counter is loaded at all.
  const counting = analyticsEnabled();

  return (
    <PageShell>
      <p className="eyebrow !text-accent">Privacy</p>
      <h1 className="mt-4 font-serif text-[clamp(2.5rem,7vw,3.75rem)] leading-[1] tracking-tight">
        What happens to <em className="italic">your poem.</em>
      </h1>
      <p className="mt-6 text-lg leading-8 text-ink/90">
        Stanza is a small tool for poems, so here is exactly what it does with yours. No legal fog: if something below stops being true, that is a bug, and you can{" "}
        <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer" className={A}>
          tell me
        </a>
        .
      </p>
      <p className="mt-3 text-sm text-muted">Last updated 14 October 2026.</p>

      <Section id="ai" title="The AI reads your poem only if you let it">
        <p>
          Stanza can ask Google&apos;s Gemini to read the mood of your poem. That happens <strong>only when &ldquo;Read with AI&rdquo; is on</strong>. It is on by default, and you can switch it off on the first page and again in the editor, next to your poem.
        </p>
        <p>
          When it is on, the words of your poem are sent from Stanza&apos;s server to Google&apos;s Gemini API. Gemini answers with a mood, a palette suggestion, a one-sentence reading and a few words to emphasise. It never writes, changes or adds a word of your poem. Google handles what it receives under its own terms for the Gemini API. <strong>Stanza uses Gemini&apos;s free tier, where Google may use submitted text to improve its products. Turn off Read with AI to keep your poem away from Google.</strong>
        </p>
        <p>
          When it is off, the poem is <strong>never sent to Google</strong>. Stanza&apos;s built-in reader picks the mood instead. It is plainer, but the poster works the same.
        </p>
      </Section>

      <Section id="server" title="Stanza's own server still sees the poem">
        <p>
          Even with &ldquo;Read with AI&rdquo; off, your poem travels to Stanza&apos;s server, because that is where the pronunciation dictionary lives and where syllables, stresses and rhymes are worked out. It is handled in memory and answered straight away. Stanza has no database and does not save poems. Its logs record counts and timings, never the text.
        </p>
        <p>
          Stanza is hosted on Vercel, which, like any web host, sees the technical details of a request, such as the IP address and the time, in its own logs.
        </p>
      </Section>

      <Section id="photos" title="Photos never leave your device">
        <p>
          A photo you use as a background is opened and drawn inside your browser. It is not uploaded, not sent to Stanza&apos;s server, not part of the AI request and not part of a share link. Reload the page and it is gone.
        </p>
        <p>The video and poster you export are also made in your browser and saved to your device. Nothing is uploaded.</p>
      </Section>

      <Section id="tracking" title="No accounts, no cookies, no tracking">
        <p>
          There are no accounts and no sign-in. Stanza sets no cookies and keeps nothing in your browser&apos;s storage. There are no advertising or tracking scripts, and the fonts are served by Stanza itself, so your browser does not contact Google Fonts or any other third party.
        </p>
        <p>
          {counting ? (
            <>
              <strong>Page counting is on.</strong> Stanza counts anonymous page views with Vercel Web Analytics, which uses no cookies and does not follow you from site to site. The address it receives is cut off at any <code>?</code> or <code>#</code> first, so a poem in a share link is never part of it.
            </>
          ) : (
            <>
              <strong>Page counting is off.</strong> If it is ever switched on, it will be anonymous page counts with no cookies, and this page will say so.
            </>
          )}
        </p>
      </Section>

      <Section id="links" title="A share link contains your poem">
        <p>
          When you copy a share link, your poem and your settings are packed into the part of the link after the <code>#</code>. <strong>Anyone who has the link can read the whole poem.</strong> Treat the link like the poem itself.
        </p>
        <p>
          Browsers never send the part after the <code>#</code> to a server, so Stanza and Vercel do not receive it when someone opens the link. But it stays in the history of every browser that opens it, and in any chat or email where you pasted it. A link cannot be recalled or deleted, because there is no account behind it. If a poem should stay private, do not share its link.
        </p>
      </Section>

      <Section id="yours" title="It is still yours">
        <p>
          Stanza does not keep your poems, does not claim any rights in them, and does not use them for anything except showing them back to you.
        </p>
        <p>
          <Link href="/" className={A_BLOCK}>
            Back to Stanza
          </Link>
        </p>
      </Section>
    </PageShell>
  );
}
