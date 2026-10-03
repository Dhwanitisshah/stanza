"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { settingsFromShare } from "@/lib/editor/settings";
import { decodeShare, readShareHash } from "@/lib/share/encode";
import { Editor, newSettings, type Session } from "./Editor";
import { Landing } from "./Landing";

function subscribeToHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

/** What opening a share link leads to: a session (restored exactly, or just the poem), or a message on the landing page. */
function openLink(payload: string, id: number): { session?: Session; banner?: string } {
  const decoded = decodeShare(payload);
  if (decoded.ok) {
    const notice = decoded.notices.length > 0 ? decoded.notices.join(" ") : undefined;
    return { session: { id, poem: decoded.state.poem, settings: settingsFromShare(decoded.state), fromLink: true, notice } };
  }
  if (decoded.poem) {
    // Broken or old link, but the poem is still in there: open the editor with it and say what happened.
    return { session: { id, poem: decoded.poem, settings: newSettings(), fromLink: false, notice: `${decoded.message} Your poem is here, so you can carry on.` } };
  }
  return { banner: decoded.message };
}

/**
 * One page, two views: the landing page and the editor. A share link (#p=...) opens the editor straight away.
 * The URL hash is read with useSyncExternalStore so the server render and the first client render agree.
 */
export function App() {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash, () => "");
  const payload = readShareHash(hash);

  const [session, setSession] = useState<Session | null>(null);
  const [handledLink, setHandledLink] = useState<string | null>(null);
  const [nextId, setNextId] = useState(1);

  const fromLink = useMemo(() => (payload && payload !== handledLink ? openLink(payload, 0) : null), [payload, handledLink]);
  const active = session ?? fromLink?.session ?? null;

  function perform(poem: string, title: string) {
    setHandledLink(payload);
    setSession({ id: nextId, poem, settings: newSettings({ title }), fromLink: false });
    setNextId((n) => n + 1);
  }

  function leave(goToHow: boolean) {
    setHandledLink(payload);
    setSession(null);
    if (goToHow) setTimeout(() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  if (active) return <Editor key={`${active.id}-${payload ?? ""}`} session={active} onExit={leave} />;
  return <Landing onPerform={perform} banner={fromLink?.banner} />;
}
