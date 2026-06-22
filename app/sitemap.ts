/**
 * Dynamic sitemap (NFR-SEO-01) — app/sitemap.ts → /sitemap.xml.
 *
 * Lists every PUBLISHED, non-deleted content item as an absolute public-site URL
 * with lastModified = updatedAt. Queries Prisma directly and selects ONLY the
 * columns it needs (slug/type/updatedAt) so the query stays light even with a
 * large corpus.
 *
 * Note: noindex items are intentionally still listed here — the per-item
 * canonical/robots meta on the public site handles indexing; the sitemap is just
 * a discovery hint. The whole sitemap is suppressed when SEO_NOINDEX is set.
 */

import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db/prisma";
import { canonicalUrl, absoluteUrl } from "@/lib/seo/canonical";
import { isNoIndex } from "@/lib/seo/robots-flags";

export const runtime = "nodejs";
// Generated per request, NOT at build time — the build environment (Docker /
// Railply / CI) has no database, so this must never run during `next build`.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const home: MetadataRoute.Sitemap[number] = {
    url: absoluteUrl(),
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 1,
  };

  // When the whole site is flagged noindex, emit only the homepage entry.
  if (isNoIndex()) {
    return [home];
  }

  // Resilient: a DB hiccup yields the homepage-only sitemap, never a 500/build break.
  let rows: { slug: string; type: "BLOG" | "WEBINAR" | "NEWS" | "RESOURCE" | "FAQ"; updatedAt: Date }[] = [];
  try {
    rows = await prisma.contentItem.findMany({
      where: { status: "PUBLISHED", deletedAt: null },
      // Lightweight projection — only what a sitemap URL needs.
      select: { slug: true, type: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });
  } catch (error) {
    console.error("[sitemap] DB query failed; serving homepage-only sitemap:", error);
    return [home];
  }

  const entries: MetadataRoute.Sitemap = rows.map((row) => ({
    url: canonicalUrl(row.type, row.slug),
    lastModified: row.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [home, ...entries];
}
