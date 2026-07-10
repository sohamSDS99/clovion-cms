/**
 * GET /api/public/v1/content — list PUBLISHED content (FR §6.2).
 *
 * UNAUTHENTICATED. Serves only status=PUBLISHED, deletedAt=null content as
 * lightweight summaries (no rendered bodyHtml / jsonLd) for index/listing pages.
 *
 * Query:
 *   type?   — one of BLOG|WEBINAR|NEWS|RESOURCE|FAQ
 *   limit?  — 1..100 (default 20)
 *   cursor? — id of the last item from the previous page
 *
 * Perf (NFR-PERF-01): the limit is hard-capped at 100 and listPublished uses a
 * single bounded query with relation includes (no N+1). Responses are public and
 * edge-cached with stale-while-revalidate so p95 stays well under 200ms on warm
 * caches; publish webhooks purge the CDN on content changes.
 */

import { z } from "zod";
import { withRoute, json, parseQuery } from "@/lib/api/http";
import { listPublished, resolveAvatarUrls, avatarUrlFor } from "@/lib/public/query";
import { toPublicSummary } from "@/lib/public/serialize";
import { withCache } from "@/lib/public/cache";

export const runtime = "nodejs";

const querySchema = z.object({
  type: z.enum(["BLOG", "RESEARCH", "WEBINAR", "NEWS", "RESOURCE", "FAQ"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const { type, limit, cursor } = parseQuery(searchParams, querySchema);

  const { items, nextCursor } = await listPublished({ type, limit, cursor });

  // Resolve author avatars in one batched query (avoids N+1), then serialize.
  const avatars = await resolveAvatarUrls(
    items.map((it) => it.authorProfile?.avatarAssetId),
  );

  const res = json({
    data: items.map((it) => toPublicSummary(it, avatarUrlFor(it, avatars))),
    pagination: { nextCursor, limit },
  });
  // Listing pages are cheap to revalidate and high-traffic — favour a longer
  // shared (CDN) TTL with a generous stale window. Browser TTL stays short.
  return withCache(res, { maxAge: 60, sMaxAge: 300, swr: 900 });
});
