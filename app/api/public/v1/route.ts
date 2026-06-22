/**
 * GET /api/public/v1 — public API index / discovery document.
 *
 * UNAUTHENTICATED. A tiny, self-documenting map of the public read endpoints and
 * the API version so the website (and humans) can discover what's available.
 */

import { withRoute, json } from "@/lib/api/http";
import { withCache } from "@/lib/public/cache";

export const runtime = "nodejs";

export const GET = withRoute(async () => {
  const res = json({
    name: "Clovion CMS Public API",
    version: "v1",
    endpoints: {
      listContent: {
        method: "GET",
        path: "/api/public/v1/content",
        query: { type: "BLOG|WEBINAR|NEWS|RESOURCE|FAQ (optional)", limit: "1-100", cursor: "uuid" },
      },
      getContent: {
        method: "GET",
        path: "/api/public/v1/content/{type}/{slug}",
      },
      getAuthor: {
        method: "GET",
        path: "/api/public/v1/authors/{slug}",
      },
    },
  });
  // Discovery doc is static — cache it aggressively.
  return withCache(res, { maxAge: 300, sMaxAge: 3600, swr: 86400 });
});
