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
