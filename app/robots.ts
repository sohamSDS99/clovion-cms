/**
 * Dynamic robots.txt (NFR-SEO-01) — app/robots.ts → /robots.txt.
 *
 * Default: allow all crawling and advertise the sitemap. When SEO_NOINDEX is set
 * (staging/preview), disallow everything so the environment stays out of indexes.
 */

import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/canonical";
import { isNoIndex } from "@/lib/seo/robots-flags";

export const runtime = "nodejs";

export default function robots(): MetadataRoute.Robots {
  const sitemap = absoluteUrl("sitemap.xml");

  if (isNoIndex()) {
    return {
      rules: { userAgent: "*", disallow: "/" },
      sitemap,
    };
  }

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap,
  };
}
