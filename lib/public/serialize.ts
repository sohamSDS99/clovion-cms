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

/** Full public content payload (single-item endpoint). */
export interface PublicContent {
  id: string;
  type: ContentItem["type"];
  title: string;
  slug: string;
  excerpt: string | null;
  bodyHtml: string;
  coverImageUrl: string | null;
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

function toSeo(item: ContentItem): PublicSeo {
  const raw = (item.seo ?? {}) as RawSeo;
  return {
    metaTitle: raw.metaTitle,
    metaDescription: raw.metaDescription,
    canonicalUrl: raw.canonicalUrl ?? defaultCanonical(item.type, item.slug),
    ogImage: raw.ogImage,
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

/**
 * True when a gated-download item is gated behind a lead form. RESOURCE and
 * RESEARCH share the same gated-download model (PDF + optional lead gate).
 */
function isGatedResource(item: ContentItem): boolean {
  if (item.type !== "RESOURCE" && item.type !== "RESEARCH") return false;
  const td = (item.typeData ?? {}) as Record<string, unknown>;
  return Boolean(td.gated) || Boolean(td.leadFormId);
}

/**
 * Build the per-type public `typeData`. This re-projects only the keys that are
 * safe to publish; in particular a gated RESOURCE never emits its file/pdf URL.
 */
function toPublicTypeData(item: ContentItem): Record<string, unknown> {
  const td = (item.typeData ?? {}) as Record<string, unknown>;

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
    case "FAQ":
      return { faqItems: Array.isArray(td.faqItems) ? td.faqItems : [] };
    // RESOURCE and RESEARCH are both gated downloadable reports with the same
    // public shape. A gated item NEVER emits its file/pdf URL (NFR-SEC-03/NG3).
    case "RESOURCE":
    case "RESEARCH": {
      const gated = isGatedResource(item);
      const base: Record<string, unknown> = {
        resourceType: td.resourceType,
        resourceKind: td.resourceKind,
        fileLabel: td.fileLabel,
        gated,
        leadFormId: td.leadFormId,
      };
      // NFR-SEC-03 / NG3: surface the download URL ONLY for ungated items.
      if (!gated && typeof td.downloadUrl === "string") {
        base.downloadUrl = td.downloadUrl;
      }
      return base;
    }
    case "NEWS":
      return { source: td.source, sourceUrl: td.sourceUrl };
    case "BLOG":
    default:
      // Blogs carry no extra public structured fields by default.
      return {};
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
 */
export function toPublicContent(item: ContentItemWithRelations): PublicContent {
  const seo = toSeo(item);
  const coverImageUrl = item.coverAsset?.url ?? null;
  const author = toAuthor(item.authorProfile, null);

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
    seo,
    jsonLd,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
    updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
    author,
    tags: toTags(item.tags),
    category: toCategory(item.category),
    typeData: toPublicTypeData(item),
  };
}

/** Lightweight summary for list endpoints (no rendered body / jsonLd / typeData). */
export function toPublicSummary(item: ContentItemWithRelations): PublicContentSummary {
  const seo = toSeo(item);
  const coverImageUrl = item.coverAsset?.url ?? null;
  const author = toAuthor(item.authorProfile, null);

  return {
    id: item.id,
    type: item.type,
    title: item.title,
    slug: item.slug,
    excerpt: item.excerpt ?? null,
    coverImageUrl,
    seo,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
    updatedAt: item.updatedAt ? item.updatedAt.toISOString() : null,
    author,
    tags: toTags(item.tags),
    category: toCategory(item.category),
  };
}
