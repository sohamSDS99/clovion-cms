/**
 * GET /api/public/v1/content/[type]/[slug] — one PUBLISHED item (FR §6.2, NFR-SEO-01).
 *
 * UNAUTHENTICATED. Returns the full public payload including rendered bodyHtml
 * (rendered on the fly from `body` when the cached column is empty) and JSON-LD.
 * 404 (NotFoundError) when the item is missing, not published, or soft-deleted.
 *
 * noIndex (seo.noIndex): we still serve the content (the site may link to it),
 * but we mark the response no-store so CDNs don't cache it and the site can emit
 * a robots noindex tag from the returned seo block.
 */

import { z } from "zod";
import { withRoute, json, parseQuery, NotFoundError } from "@/lib/api/http";
import { getPublishedByTypeSlug } from "@/lib/public/query";
import { toPublicContent } from "@/lib/public/serialize";
import { withCache } from "@/lib/public/cache";

export const runtime = "nodejs";

const paramsSchema = z.object({
  type: z.enum(["BLOG", "WEBINAR", "NEWS", "RESOURCE", "FAQ"]),
  slug: z.string().min(1).max(300),
});

export const GET = withRoute(
  async (
    _req: Request,
    ctx: { params: Promise<{ type: string; slug: string }> },
  ) => {
    const raw = await ctx.params;
    // Validate the path params via the same parser used for query strings.
    const { type, slug } = parseQuery(
      new URLSearchParams({ type: raw.type.toUpperCase(), slug: raw.slug }),
      paramsSchema,
    );

    const item = await getPublishedByTypeSlug(type, slug);
    if (!item) throw new NotFoundError("Published content not found.");

    const payload = toPublicContent(item);

    const res = json({ data: payload });
    // Respect noIndex: do not let the edge cache pages flagged noindex.
    return withCache(res, { noStore: payload.seo.noIndex });
  },
);
