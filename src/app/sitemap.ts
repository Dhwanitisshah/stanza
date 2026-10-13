import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Two public pages. Share links live in a #hash and are never listed anywhere.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: `${base}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
