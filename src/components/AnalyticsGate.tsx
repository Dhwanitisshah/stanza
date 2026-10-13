"use client";

import { Analytics } from "@vercel/analytics/next";
import { cleanEvent } from "@/lib/analytics";

// A client component because beforeSend is a function, and functions cannot be passed down from a server component.
// Cookieless. Counts page views only; the address is stripped of ?query and #hash first (see lib/analytics.ts).
export function AnalyticsGate() {
  return <Analytics beforeSend={cleanEvent} />;
}
