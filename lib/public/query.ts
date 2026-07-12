/**
 * Shared Prisma queries for the PUBLIC read API.
 *
 * Every query here hard-filters to publicly visible content:
 *   status = PUBLISHED AND deletedAt = null.
 * No internal/draft/scheduled content can ever leak through these helpers.
 */

import type { ContentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { ContentItemWithRelations } from "./serialize";

/** Relation include used everywhere so serialization has all it needs. */
export const PUBLIC_INCLUDE = {
  authorProfile: true,
  category: true,
  coverAsset: true,
  tags: true,
} satisfies Prisma.ContentItemInclude;

/** Base WHERE: only published, non-deleted content is ever public. */
function publishedWhere(extra?: Prisma.ContentItemWhereInput): Prisma.ContentItemWhereInput {
  return { status: "PUBLISHED", deletedAt: null, ...extra };
}

// ── Avatar resolution ────────────────────────────────────────────────────────
// An author's avatar is stored as `AuthorProfile.avatarAssetId` — an FK-less UUID
// (repo convention: generic asset/creator columns are app-enforced, not DB FKs).
// Prisma therefore cannot `include` it, so the public layer resolves it here and
// threads the URL into the (pure) serializers.

type VariantUrlMap = Partial<Record<"thumb" | "md" | "lg", string>>;

/** Prefer the small `thumb` variant for an 80×80 avatar; fall back to original. */
function pickAvatarUrl(asset: { url: string; variants: unknown }): string {
  const variants = (asset.variants ?? {}) as VariantUrlMap;
  return variants.thumb ?? asset.url;
}

/** Batch-resolve avatar asset ids → public URLs (skips missing/soft-deleted). */
export async function resolveAvatarUrls(
  assetIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = [...new Set(assetIds.filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return new Map();
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, url: true, variants: true },
  });
  const map = new Map<string, string>();
  for (const a of assets) map.set(a.id, pickAvatarUrl(a));
  return map;
}

/** Resolve a single avatar asset id → public URL, or null. */
export async function resolveAvatarUrl(
  assetId: string | null | undefined,
): Promise<string | null> {
  if (!assetId) return null;
  const map = await resolveAvatarUrls([assetId]);
  return map.get(assetId) ?? null;
}

/**
 * Resolve a RESOURCE item's downloadable file (`typeData.pdfAssetId`)
 * to its public URL. Returns null for non-resource types or when unset/deleted.
 * Gating is enforced by the serializer — this only resolves the asset URL, so
 * the caller can pass it straight into `toPublicContent`.
 */
export async function resolveResourceDownloadUrl(
  item: ContentItemWithRelations,
): Promise<string | null> {
  const td = (item.typeData ?? {}) as Record<string, unknown>;
  const pdfAssetId = typeof td.pdfAssetId === "string" ? td.pdfAssetId : null;
  if (!pdfAssetId) return null;
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: pdfAssetId, deletedAt: null },
    select: { url: true },
  });
  return asset?.url ?? null;
}

/**
 * Resolve an item's Open Graph share image (`seo.ogImageAssetId`) to its public
 * URL, preferring the large variant for social cards. Returns null when unset or
 * the asset is missing/soft-deleted (the serializer then falls back to cover).
 * Like the avatar, this is an FK-less asset ref so it can't be `include`d.
 */
export async function resolveOgImageUrl(
  item: ContentItemWithRelations,
): Promise<string | null> {
  const seo = (item.seo ?? {}) as { ogImageAssetId?: unknown };
  const id = typeof seo.ogImageAssetId === "string" ? seo.ogImageAssetId : null;
  if (!id) return null;
  const asset = await prisma.mediaAsset.findFirst({
    where: { id, deletedAt: null },
    select: { url: true, variants: true },
  });
  if (!asset) return null;
  const variants = (asset.variants ?? {}) as VariantUrlMap;
  return variants.lg ?? asset.url;
}

/** The resolved avatar URL for a content item's author, given a resolved map. */
export function avatarUrlFor(
  item: ContentItemWithRelations,
  map: Map<string, string>,
): string | null {
  const id = item.authorProfile?.avatarAssetId;
  return id ? map.get(id) ?? null : null;
}

export interface ListPublishedParams {
  type?: ContentType;
  limit: number;
  cursor?: string;
}

export interface ListPublishedResult {
  items: ContentItemWithRelations[];
  nextCursor: string | null;
}

/** List published items, newest-published first, cursor-paginated. */
export async function listPublished(
  params: ListPublishedParams,
): Promise<ListPublishedResult> {
  const { type, limit, cursor } = params;
  const rows = (await prisma.contentItem.findMany({
    where: publishedWhere(type ? { type } : undefined),
    include: PUBLIC_INCLUDE,
    // publishedAt desc is the public feed order; id as a stable tiebreaker.
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })) as ContentItemWithRelations[];

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
  };
}

/** Fetch one published item by (type, slug), or null. */
export async function getPublishedByTypeSlug(
  type: ContentType,
  slug: string,
): Promise<ContentItemWithRelations | null> {
  return (await prisma.contentItem.findFirst({
    where: publishedWhere({ type, slug }),
    include: PUBLIC_INCLUDE,
  })) as ContentItemWithRelations | null;
}

/** Fetch a public author profile by slug, or null (must be isPublic). */
export async function getPublicAuthor(slug: string) {
  return prisma.authorProfile.findFirst({
    where: { slug, isPublic: true },
  });
}

/** List an author's published items (newest first). */
export async function listPublishedByAuthor(
  authorProfileId: string,
  limit: number,
): Promise<ContentItemWithRelations[]> {
  return (await prisma.contentItem.findMany({
    where: publishedWhere({ authorProfileId }),
    include: PUBLIC_INCLUDE,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit,
  })) as ContentItemWithRelations[];
}
