/**
 * Media library service (FR-MEDIA-01..04, FR-EDITOR-07).
 *
 * Orchestrates storage (S3) + image processing (sharp) + the MediaAsset table.
 * Routes stay thin; all upload/validation/where-used logic lives here.
 */
import { Prisma, type MediaAsset } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ConflictError, NotFoundError } from "@/lib/api/http";
import { recordAudit } from "@/lib/audit/service";
import type { SessionUser } from "@/lib/auth/guard";
import { requireCapability } from "@/lib/auth/guard";
import {
  buildStorageKey,
  deleteObject,
  publicUrl,
  putObject,
} from "@/lib/media/storage";
import { extractImageMeta, generateVariants } from "@/lib/media/variants";
import { validateUpload, type MediaKind } from "@/lib/media/limits";
import { findEmbeddedAssetRefs } from "./embeds";

/** Raw upload payload extracted from the multipart request. */
export interface UploadFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/** Map of variant name -> public URL stored on the asset. */
export type VariantUrlMap = Partial<Record<"thumb" | "md" | "lg", string>>;

/** A structured reference to an asset (FR-MEDIA-04). */
export interface UsageRef {
  type: "content" | "author_profile";
  id: string;
  title: string;
}

/**
 * FR-MEDIA-01/02 — Validate, upload original + (for images) responsive WebP
 * variants, and persist a MediaAsset row. Returns the created asset.
 *
 * Caller is responsible for `requireCapability("upload_media")` and for calling
 * `ensureBucket()` before the first put in a process.
 */
export async function createAssetFromUpload(
  user: SessionUser,
  file: UploadFile
): Promise<MediaAsset> {
  const kind: MediaKind = validateUpload(file.mimeType, file.sizeBytes);

  const originalKey = buildStorageKey(file.filename);

  let width: number | null = null;
  let height: number | null = null;
  const variants: VariantUrlMap = {};

  if (kind === "IMAGE") {
    // Extract dimensions + build renditions. Animated/odd images degrade
    // gracefully to "original only" (generateVariants returns []).
    try {
      const meta = await extractImageMeta(file.buffer);
      width = meta.width || null;
      height = meta.height || null;
    } catch {
      // Non-fatal: keep dimensions null if sharp can't read it.
    }

    const generated = await generateVariants(file.buffer, file.mimeType);
    for (const v of generated) {
      const vKey = `${originalKey}.${v.name}.webp`;
      await putObject(vKey, v.buffer, v.contentType);
      variants[v.name] = publicUrl(vKey);
    }
  }

  // Upload the original last so a partial-variant failure doesn't orphan it.
  await putObject(originalKey, file.buffer, file.mimeType);

  const asset = await prisma.mediaAsset.create({
    data: {
      kind,
      storageKey: originalKey,
      url: publicUrl(originalKey),
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: BigInt(file.sizeBytes),
      width,
      height,
      variants: variants as Prisma.InputJsonValue,
      uploadedById: user.id,
      createdById: user.id,
    },
  });

  await recordAudit({
    actorId: user.id,
    entityType: "media",
    entityId: asset.id,
    action: "created",
    diff: { kind, filename: file.filename, sizeBytes: file.sizeBytes },
  });

  return asset;
}

export interface ListAssetsFilters {
  kind?: MediaKind;
  uploadedById?: string;
  /** Free-text match on filename / altText / caption. */
  q?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  cursor?: string;
}

/** FR-MEDIA-03 — Browse the library (newest first), excluding soft-deleted. */
export async function listAssets(filters: ListAssetsFilters = {}) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const q = filters.q?.trim();

  const rows = await prisma.mediaAsset.findMany({
    where: {
      deletedAt: null,
      kind: filters.kind,
      uploadedById: filters.uploadedById,
      createdAt:
        filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
      ...(q
        ? {
            OR: [
              { filename: { contains: q, mode: "insensitive" } },
              { altText: { contains: q, mode: "insensitive" } },
              { caption: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null };
}

/** Fetch a single non-deleted asset or throw NotFoundError. */
export async function getAsset(id: string): Promise<MediaAsset> {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id, deletedAt: null },
  });
  if (!asset) throw new NotFoundError("Media asset not found.");
  return asset;
}

/** FR-MEDIA-03 — Update editorial metadata (alt text / caption). */
export async function updateMetadata(
  user: SessionUser,
  id: string,
  patch: { altText?: string | null; caption?: string | null }
): Promise<MediaAsset> {
  const existing = await getAsset(id);

  const asset = await prisma.mediaAsset.update({
    where: { id: existing.id },
    data: {
      altText: patch.altText,
      caption: patch.caption,
      updatedById: user.id,
    },
  });

  await recordAudit({
    actorId: user.id,
    entityType: "media",
    entityId: asset.id,
    action: "updated",
    diff: {
      before: { altText: existing.altText, caption: existing.caption },
      after: { altText: asset.altText, caption: asset.caption },
    },
  });

  return asset;
}

/**
 * Re-export the pure inline-embed helpers (defined in ./embeds to keep them
 * free of Prisma/next-auth so they stay unit-testable).
 */
export { findEmbeddedAssetRefs, type EmbedAssetMatch } from "./embeds";

/**
 * FR-MEDIA-04 — Find references to an asset.
 *
 * Covers both structured references and inline body embeds:
 *   STRUCTURED (JSON-path / FK-style, indexed query):
 *     - ContentItem.coverAssetId
 *     - ContentItem.seo->>'og_image_asset_id'
 *     - ContentItem.typeData->>'pdfAssetId'
 *     - AuthorProfile.avatarAssetId
 *   INLINE BODY EMBEDS (Tiptap doc walk):
 *     - image nodes in ContentItem.body referencing this asset by `assetId`
 *       attr, or by the asset's url/storageKey appearing in the image `src`.
 *
 * Approach for body embeds: we pre-filter candidate items in SQL by JSON
 * `string_contains` on the body for the asset id / url / storageKey (so we only
 * pull bodies that plausibly mention the asset), then confirm precisely in JS by
 * walking the doc with the pure `findEmbeddedAssetRefs` helper. This keeps us
 * from loading every body into memory while remaining accurate. Results are
 * merged with the structured refs and de-duplicated by content id.
 */
export async function whereUsed(id: string): Promise<UsageRef[]> {
  const refs: UsageRef[] = [];
  const seenContent = new Set<string>();

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { url: true, storageKey: true },
  });
  const assetUrl = asset?.url ?? "";
  const assetKey = asset?.storageKey ?? "";

  // Content references: cover image OR SEO og:image OR type-specific PDF.
  const content = await prisma.contentItem.findMany({
    where: {
      deletedAt: null,
      OR: [
        { coverAssetId: id },
        { seo: { path: ["og_image_asset_id"], equals: id } },
        { typeData: { path: ["pdfAssetId"], equals: id } },
      ],
    },
    select: { id: true, title: true },
  });
  for (const c of content) {
    if (seenContent.has(c.id)) continue;
    seenContent.add(c.id);
    refs.push({ type: "content", id: c.id, title: c.title });
  }

  // Inline body embeds. Pre-filter candidate bodies in SQL with a JSON
  // string_contains on the asset id/url/storageKey, then confirm in JS.
  const bodyOr: Prisma.ContentItemWhereInput[] = [
    { body: { string_contains: id } },
  ];
  if (assetUrl) bodyOr.push({ body: { string_contains: assetUrl } });
  if (assetKey) bodyOr.push({ body: { string_contains: assetKey } });

  const candidates = await prisma.contentItem.findMany({
    where: { deletedAt: null, OR: bodyOr },
    select: { id: true, title: true, body: true },
  });
  for (const c of candidates) {
    if (seenContent.has(c.id)) continue;
    if (
      findEmbeddedAssetRefs(c.body, { id, url: assetUrl, storageKey: assetKey })
    ) {
      seenContent.add(c.id);
      refs.push({ type: "content", id: c.id, title: c.title });
    }
  }

  // Author avatar references.
  const authors = await prisma.authorProfile.findMany({
    where: { avatarAssetId: id },
    select: { id: true, displayName: true },
  });
  for (const a of authors) {
    refs.push({ type: "author_profile", id: a.id, title: a.displayName });
  }

  return refs;
}

/**
 * FR-MEDIA-04 — Delete an asset. Blocked (409) when still referenced; otherwise
 * soft-deletes the row and removes the object (+ variants) from storage.
 * Requires `manage_media_library`.
 */
export async function deleteAsset(
  user: SessionUser,
  id: string
): Promise<void> {
  await requireCapability("manage_media_library");

  const asset = await getAsset(id);

  const references = await whereUsed(id);
  if (references.length > 0) {
    throw new ConflictError(
      "Asset is still in use and cannot be deleted.",
      { references }
    );
  }

  // Soft-delete the DB row first (source of truth), then clean storage.
  await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: { deletedAt: new Date(), updatedById: user.id },
  });

  // Remove original + any variants. Storage cleanup is best-effort.
  const keys = [
    asset.storageKey,
    ...variantKeysFor(asset),
  ];
  await Promise.all(
    keys.map((k) =>
      deleteObject(k).catch((e) =>
        console.error("[media] failed to delete object", k, e)
      )
    )
  );

  await recordAudit({
    actorId: user.id,
    entityType: "media",
    entityId: asset.id,
    action: "deleted",
    diff: { storageKey: asset.storageKey, filename: asset.filename },
  });
}

/** Derive variant storage keys (we store them as `${originalKey}.${name}.webp`). */
function variantKeysFor(asset: MediaAsset): string[] {
  const variants = (asset.variants ?? {}) as VariantUrlMap;
  return (Object.keys(variants) as Array<keyof VariantUrlMap>).map(
    (name) => `${asset.storageKey}.${name}.webp`
  );
}

/**
 * Serialize a MediaAsset for JSON responses — BigInt `sizeBytes` is not
 * JSON-serializable, so coerce it to a number.
 */
export function serializeAsset(asset: MediaAsset) {
  return {
    ...asset,
    sizeBytes: Number(asset.sizeBytes),
  };
}
