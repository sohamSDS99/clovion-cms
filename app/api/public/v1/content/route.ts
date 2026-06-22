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
 */

import { z } from "zod";
import { withRoute, json, parseQuery } from "@/lib/api/http";
import { listPublished } from "@/lib/public/query";
import { toPublicSummary } from "@/lib/public/serialize";
import { withCache } from "@/lib/public/cache";

export const runtime = "nodejs";

const querySchema = z.object({
  type: z.enum(["BLOG", "WEBINAR", "NEWS", "RESOURCE", "FAQ"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const { type, limit, cursor } = parseQuery(searchParams, querySchema);

  const { items, nextCursor } = await listPublished({ type, limit, cursor });

  const res = json({
    data: items.map(toPublicSummary),
    pagination: { nextCursor, limit },
  });
  return withCache(res);
});
