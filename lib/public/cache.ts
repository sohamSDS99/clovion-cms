/**
 * CDN cache-control helpers for the public read API.
 *
 * Target: p95 < 200ms for cached responses. We serve a short browser TTL plus a
 * longer shared (CDN) TTL with stale-while-revalidate, so edge hits are instant
 * and origin load stays low. Publish webhooks (lib/webhooks/publish) purge the
 * CDN on content changes, so a generous s-maxage is safe.
 */

import type { NextResponse } from "next/server";

export interface CacheOptions {
  /** Browser cache seconds (max-age). */
  maxAge?: number;
  /** Shared/CDN cache seconds (s-maxage). */
  sMaxAge?: number;
  /** stale-while-revalidate window in seconds. */
  swr?: number;
  /** When true, mark as private/no-store (e.g. noIndex items we still serve). */
  noStore?: boolean;
}

const DEFAULTS: Required<Omit<CacheOptions, "noStore">> = {
  maxAge: 60, // 1 min in-browser
  sMaxAge: 300, // 5 min at the edge
  swr: 600, // serve stale up to 10 min while revalidating
};

/** Apply Cache-Control headers to a NextResponse and return it. */
export function withCache(res: NextResponse, opts: CacheOptions = {}): NextResponse {
  if (opts.noStore) {
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  }
  const maxAge = opts.maxAge ?? DEFAULTS.maxAge;
  const sMaxAge = opts.sMaxAge ?? DEFAULTS.sMaxAge;
  const swr = opts.swr ?? DEFAULTS.swr;
  res.headers.set(
    "Cache-Control",
    `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
  );
  return res;
}
