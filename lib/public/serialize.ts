/**
 * Public serialization layer (FR §6.2, NFR-SEC-03, NG3).
 *
 * Converts an internal ContentItem (with relations) into the public-safe shape
 * the website consumes. This is the single chokepoint that decides what leaves
 * the building: anything not explicitly mapped here is NOT exposed.
 *
 * Hard rules enforced here:
 *   - Internal fields (createdById, updatedById, currentRevisionId, deletedAt,
 *     raw Tiptap `body`, schemaMarkup, scheduledAt, internal status, …) are stripped.
 *   - Author byline is only exposed when the AuthorProfile is public (isPublic).
 *   - A GATED RESOURCE exposes its metadata + leadFormId but NEVER the file/pdf URL
 *     (NFR-SEC-03 / NG3). The gate is what the lead form unlocks server-side later.
 */

import type {
  AuthorProfile,
  Category,
  ContentItem,
  MediaAsset,
  Tag,
} from "@prisma/client";
import { generateJsonLd, type JsonLdInput } from "@/lib/seo/jsonld";
import { renderTiptapToHtml } from "./render";

/**
 * ContentItem joined with the relations the public layer needs. Routes should
 * fetch with this include so serialization has everything in one query.
 */
export type ContentItemWithRelations = ContentItem & {
  authorProfile: AuthorProfile | null;
  category: Category | null;
  coverAsset: MediaAsset | null;
  tags: Tag[];
};

/** Public SEO block (mirrors the editor's seo JSON shape). */
export interface PublicSeo {
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  ogImage?: string;
  noIndex: boolean;
}

export interface PublicAuthor {
  displayName: string;
  slug: string;
  title?: string | null;
  avatar?: string | null;
  socials: Record<string, string>;
  bio?: string | null;
}

export interface PublicTag {
  name: string;
  slug: string;
}

export interface PublicCategory {
  name: string;
  slug: string;
}

/**
 * Cover image with responsive WebP variants + intrinsic dimensions. Lets the
 * website serve the right-sized image per card (srcset) and decide cover-vs-fit
 * from the aspect ratio (width/height) instead of loading the full original
 * everywhere. `coverImageUrl` (the original) is kept for backward compatibility.
 */
export interface PublicCoverImage {
  url: string;
  thumb: string | null;
  md: string | null;
  lg: string | null;
  width: number | null;
  height: number | null;
}

/**
 * A COURSE lesson download, resolved to its public URL by the query layer
 * (`resolveCourseDownloads`). The raw `typeData.downloads` entries only carry a
 * mediaAssetId — that id is never exposed publicly without its URL.
 */
export interface PublicCourseDownload {
  label: string;
  url: string;
  filename: string | null;
}

/** Full public content payload (single-item endpoint). */
export interface PublicContent {
  id: string;
  type: ContentItem["type"];
  title: string;
  slug: string;
  excerpt: string | null;
  bodyHtml: string;
  coverImageUrl: string | null;
  coverImage: PublicCoverImage | null;
  seo: PublicSeo;
  jsonLd: Record<string, unknown>;
  publishedAt: string | null;
  updatedAt: string | null;
  author: PublicAuthor | null;
  tags: PublicTag[];
  category: PublicCategory | null;
  typeData: Record<string, unknown>;
}

/** Lightweight list payload — same fields minus the heavy rendered body/jsonLd. */
export type PublicContentSummary = Omit<
  PublicContent,
  "bodyHtml" | "jsonLd" | "typeData"
>;

// Raw SEO shape as persisted on ContentItem.seo.
interface RawSeo {
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  ogImage?: string;
  noIndex?: boolean;
}

/**
 * Public site base URL used to compute canonical/og URLs when the editor did not
 * set an explicit canonicalUrl. Falls back to empty so JSON-LD simply omits URLs.
 */
function siteBaseUrl(): string {
  return (process.env.PUBLIC_SITE_BASE_URL ?? "").replace(/\/+$/, "");
}

/** Convention for an item's canonical path on the public site. */
function defaultCanonical(type: ContentItem["type"], slug: string): string | undefined {
  const base = siteBaseUrl();
  if (!base) return undefined;
  return `${base}/${type.toLowerCase()}/${slug}`;
}

/**
 * `ogImageUrl` is the OG share image resolved from `seo.ogImageAssetId` by the
 * query layer (FK-less asset ref, can't be `include`d). When unset it falls back
 * to any literal `seo.ogImage` URL, then to the cover image — so a shared page
 * always has a social card image.
 */
function toSeo(
  item: ContentItem,
  ogImageUrl?: string | null,
  coverFallback?: string | null,
): PublicSeo {
  const raw = (item.seo ?? {}) as RawSeo;
  return {
    metaTitle: raw.metaTitle,
    metaDescription: raw.metaDescription,
    canonicalUrl: raw.canonicalUrl ?? defaultCanonical(item.type, item.slug),
    ogImage: ogImageUrl ?? raw.ogImage ?? coverFallback ?? undefined,
    noIndex: raw.noIndex ?? false,
  };
}

/** Author byline — only when the profile opted into being public. */
function toAuthor(profile: AuthorProfile | null, avatarUrl?: string | null): PublicAuthor | null {
  if (!profile || !profile.isPublic) return null;
  return {
    displayName: profile.displayName,
    slug: profile.slug,
    title: profile.title ?? null,
    avatar: avatarUrl ?? null,
    socials: (profile.socialLinks ?? {}) as Record<string, string>,
    bio: profile.bio ?? null,
  };
}

function toTags(tags: Tag[]): PublicTag[] {
  return tags.map((t) => ({ name: t.name, slug: t.slug }));
}

function toCategory(category: Category | null): PublicCategory | null {
  return category ? { name: category.name, slug: category.slug } : null;
}

type CoverVariantMap = Partial<Record<"thumb" | "md" | "lg", string>>;

/** Project a cover MediaAsset into the public cover shape (variants + dims). */
function toCoverImage(asset: MediaAsset | null): PublicCoverImage | null {
  if (!asset?.url) return null;
  const variants = (asset.variants ?? {}) as CoverVariantMap;
  return {
    url: asset.url,
    thumb: variants.thumb ?? null,
    md: variants.md ?? null,
    lg: variants.lg ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
  };
}

/**
 * True when a RESOURCE is gated behind a lead form. RESEARCH is a plain
 * long-form article (not a gated download), so it is never gated here.
 */
function isGatedResource(item: ContentItem): boolean {
  if (item.type !== "RESOURCE") return false;
  const td = (item.typeData ?? {}) as Record<string, unknown>;
  return Boolean(td.gated) || Boolean(td.leadFormId);
}

/**
 * Build the per-type public `typeData`. This re-projects only the keys that are
 * safe to publish; in particular a gated RESOURCE never emits its file/pdf URL.
 */
function toPublicTypeData(
  item: ContentItem,
  downloadUrl?: string | null,
  courseDownloads?: PublicCourseDownload[] | null,
): Record<string, unknown> {
  const td = (item.typeData ?? {}) as Record<string, unknown>;
  // Optional embeddable FAQ section — exposed for every article-shaped type so
  // the public site can render it (and build FAQPage schema from it) below the body.
  const faqItems = Array.isArray(td.faqItems) ? td.faqItems : [];

  switch (item.type) {
    case "WEBINAR":
      return {
        startAt: td.startAt,
        endAt: td.endAt,
        timezone: td.timezone,
        registrationUrl: td.registrationUrl,
        speakers: td.speakers,
        durationMinutes: td.durationMinutes,
      };
    // RESOURCE is a gated downloadable report. A gated item NEVER emits its
    // file/pdf URL (NFR-SEC-03/NG3).
    case "RESOURCE": {
      const gated = isGatedResource(item);
      const base: Record<string, unknown> = {
        resourceType: td.resourceType,
        resourceKind: td.resourceKind,
        fileLabel: td.fileLabel,
        gated,
        leadFormId: td.leadFormId,
        faqItems,
      };
      // NFR-SEC-03 / NG3: surface the download URL ONLY for ungated items.
      // The file is stored as `pdfAssetId` (a MediaAsset ref) which the query
      // layer resolves to a public URL and threads in here; fall back to a
      // literal `downloadUrl` string if one was set directly on typeData.
      if (!gated) {
        const resolved =
          downloadUrl ??
          (typeof td.downloadUrl === "string" ? td.downloadUrl : undefined);
        if (resolved) base.downloadUrl = resolved;
      }
      return base;
    }
    // COURSE: one lesson of a course. Downloads are resolved by the query
    // layer into public {label, url, filename} entries and threaded in here —
    // the raw mediaAssetId is never exposed without its URL.
    case "COURSE":
      return {
        courseSlug: td.courseSlug,
        courseTitle: td.courseTitle,
        lessonNumber: td.lessonNumber,
        keyLearnings: Array.isArray(td.keyLearnings) ? td.keyLearnings : [],
        downloads: courseDownloads ?? [],
        faqItems,
      };
    case "NEWS":
      return { source: td.source, sourceUrl: td.sourceUrl, faqItems };
    case "BLOG":
    default:
      // BLOG/RESEARCH/FAQ carry no extra public structured fields beyond the
      // FAQ section.
      return { faqItems };
  }
}

function buildJsonLdInput(
  item: ContentItemWithRelations,
  seo: PublicSeo,
  coverImageUrl: string | null,
  author: PublicAuthor | null,
): JsonLdInput {
  return {
    type: item.type,
    title: item.title,
    slug: item.slug,
    excerpt: item.excerpt,
    coverImageUrl,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    canonicalUrl: seo.canonicalUrl ?? null,
    author: author
      ? {
          displayName: author.displayName,
          slug: author.slug,
          url: siteBaseUrl() ? `${siteBaseUrl()}/author/${author.slug}` : undefined,
        }
      : null,
    typeData: (item.typeData ?? {}) as Record<string, unknown>,
    gated: isGatedResource(item),
  };
}

/**
 * Full single-item serialization including rendered HTML and JSON-LD.
 * Renders `bodyHtml` from `body` when the cached column is empty.
 *
 * `avatarUrl` is the resolved public URL for the author's avatar asset. It is
 * resolved by the query layer (the avatar is an FK-less asset reference, so it
 * cannot be joined via Prisma `include`) and threaded in here so this stays a
 * pure, synchronous function. Likewise `courseDownloads` is a COURSE lesson's
 * `typeData.downloads` already resolved to public URLs (`resolveCourseDownloads`).
 */
export function toPublicContent(
  item: ContentItemWithRelations,
  avatarUrl?: string | null,
  downloadUrl?: string | null,
  ogImageUrl?: string | null,
  courseDownloads?: PublicCourseDownload[] | null,
): PublicContent {
  const coverImageUrl = item.coverAsset?.url ?? null;
  const seo = toSeo(item, ogImageUrl, coverImageUrl);
  const author = toAuthor(item.authorProfile, avatarUrl ?? null);

  const bodyHtml =
    item.bodyHtml && item.bodyHtml.length > 0
      ? item.bodyHtml
      : renderTiptapToHtml(item.body);

  const jsonLd = generateJsonLd(buildJsonLdInput(item, seo, coverImageUrl, author));

  return {
    id: item.id,
    type: item.type,
    title: item.title,
    slug: item.slug,
    excerpt: item.excerpt ?? null,
    bodyHtml,
    coverImageUrl,
    coverImage: toCoverImage(item.coverAsset),
    seo,
    jsonLd,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
    updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
    author,
    tags: toTags(item.tags),
    category: toCategory(item.category),
    typeData: toPublicTypeData(item, downloadUrl, courseDownloads),
  };
}

/** Lightweight summary for list endpoints (no rendered body / jsonLd / typeData). */
export function toPublicSummary(
  item: ContentItemWithRelations,
  avatarUrl?: string | null,
): PublicContentSummary {
  const coverImageUrl = item.coverAsset?.url ?? null;
  // List cards resolve OG lazily to the cover image; the detail endpoint resolves
  // the explicit ogImageAssetId. (og:image matters most on the shared page.)
  const seo = toSeo(item, null, coverImageUrl);
  const author = toAuthor(item.authorProfile, avatarUrl ?? null);

  return {
    id: item.id,
    type: item.type,
    title: item.title,
    slug: item.slug,
    excerpt: item.excerpt ?? null,
    coverImageUrl,
    coverImage: toCoverImage(item.coverAsset),
    seo,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
    updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
    author,
    tags: toTags(item.tags),
    category: toCategory(item.category),
  };
}
