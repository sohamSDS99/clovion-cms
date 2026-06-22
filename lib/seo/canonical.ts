/**
 * Canonical/absolute URL helpers for the public site (NFR-SEO-01).
 *
 * The CMS itself is headless; the public website lives at PUBLIC_SITE_URL. These
 * helpers turn a (type, slug) — or any path — into the absolute URL that the
 * sitemap, robots, JSON-LD, and og/canonical tags should all agree on.
 *
 * Env precedence:
 *   PUBLIC_SITE_URL        — preferred (used by app/api/content/[id]/schema)
 *   PUBLIC_SITE_BASE_URL   — legacy fallback (used by lib/public/serialize)
 *
 * Pure + dependency-free so it stays unit-testable.
 */

/** The example/fallback origin used when no PUBLIC_SITE_URL is configured. */
export const FALLBACK_SITE_URL = "https://example.com";

/**
 * Resolve the public site origin, trailing slash stripped.
 * Falls back to FALLBACK_SITE_URL so sitemap/robots/JSON-LD always emit absolute
 * URLs (Next's MetadataRoute.sitemap requires absolute `url` values).
 */
export function siteUrl(): string {
  const raw =
    process.env.PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_BASE_URL ||
    FALLBACK_SITE_URL;
  return raw.replace(/\/+$/, "");
}

/** True when an explicit public site URL is configured (not the fallback). */
export function hasConfiguredSiteUrl(): boolean {
  return Boolean(process.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_BASE_URL);
}

/**
 * Join a path onto the site origin, producing an absolute URL.
 * Leading slashes on `path` are normalized; an empty path yields the origin.
 */
export function absoluteUrl(path = ""): string {
  const base = siteUrl();
  const clean = path.replace(/^\/+/, "");
  return clean ? `${base}/${clean}` : base;
}

/**
 * Canonical URL convention for a content item: `/{type}/{slug}` (type lowercased).
 * Mirrors lib/public/serialize.defaultCanonical so canonical/sitemap/JSON-LD match.
 */
export function canonicalUrl(type: string, slug: string): string {
  return absoluteUrl(`${type.toLowerCase()}/${slug}`);
}

/** Canonical URL for a public author page: `/author/{slug}`. */
export function authorUrl(slug: string): string {
  return absoluteUrl(`author/${slug}`);
}
