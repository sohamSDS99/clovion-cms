/**
 * Environment-driven indexing flag (NFR-SEO-01).
 *
 * SEO_NOINDEX lets non-production environments (staging/preview) opt out of all
 * search indexing in one place, consumed by both app/robots.ts and app/sitemap.ts.
 *
 * Truthy values: "1", "true", "yes", "on" (case-insensitive). Anything else
 * (including unset) means indexing is allowed.
 */

export function isNoIndex(): boolean {
  const raw = (process.env.SEO_NOINDEX ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
