/**
 * /api/content/[id]/schema — schema.org JSON-LD management (FR-EDITOR-06).
 *
 * GET  -> the persisted ContentItem.schemaMarkup, or a freshly generated preview
 *         (from generateJsonLd) when none has been saved yet.
 * POST -> regenerate JSON-LD from the current content and persist it; OR persist
 *         a manually-supplied schemaMarkup object after validating it is valid
 *         JSON (invalid JSON -> 422, blocking ONLY the schema field).
 *
 * Authorization mirrors content editing: `edit_content` with ownership resolved
 * against the loaded row. This never changes content body or status.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  withRoute,
  json,
  parseBody,
  NotFoundError,
  ValidationError,
} from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { assertCan } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/service";
import { generateJsonLd, type JsonLdInput } from "@/lib/seo/jsonld";
import type { ContentItem } from "@prisma/client";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

type ItemWithRelations = ContentItem & {
  authorProfile: { displayName: string; slug: string } | null;
  coverAsset: { url: string } | null;
};

/** Load the non-deleted item with the relations JSON-LD needs (404 otherwise). */
async function loadItem(id: string): Promise<ItemWithRelations> {
  const item = (await prisma.contentItem.findFirst({
    where: { id, deletedAt: null },
    include: {
      authorProfile: { select: { displayName: true, slug: true } },
      coverAsset: { select: { url: true } },
    },
  })) as ItemWithRelations | null;
  if (!item) throw new NotFoundError("Content not found.");
  return item;
}

function siteBaseUrl(): string {
  return (process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");
}

/** Public path segment per content type (mirrors the public read routing). */
function typePath(type: ContentItem["type"]): string {
  return type.toLowerCase();
}

/** Build the presentation-agnostic JsonLdInput from a persisted item. */
function toJsonLdInput(item: ItemWithRelations): JsonLdInput {
  const base = siteBaseUrl();
  const seo = (item.seo ?? {}) as { canonicalUrl?: string };
  const typeData = (item.typeData ?? {}) as Record<string, unknown>;
  const canonicalUrl =
    seo.canonicalUrl ??
    (base ? `${base}/${typePath(item.type)}/${item.slug}` : null);

  return {
    type: item.type,
    title: item.title,
    slug: item.slug,
    excerpt: item.excerpt,
    coverImageUrl: item.coverAsset?.url ?? null,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    canonicalUrl,
    author: item.authorProfile
      ? {
          displayName: item.authorProfile.displayName,
          slug: item.authorProfile.slug,
          url: base
            ? `${base}/author/${item.authorProfile.slug}`
            : undefined,
        }
      : null,
    typeData,
    gated: typeData.gated === true,
  };
}

/** True when the stored schemaMarkup is a non-empty object. */
function hasStoredMarkup(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value as object).length > 0
  );
}

/**
 * GET — current persisted schemaMarkup, else a freshly generated preview.
 * `generated` flags whether the body was computed on the fly (not yet saved).
 */
export const GET = withRoute(async (_req: NextRequest, { params }: Ctx) => {
  await requireCapability("edit_content", { isOwner: true });
  const { id } = await params;
  const item = await loadItem(id);

  if (hasStoredMarkup(item.schemaMarkup)) {
    return json({ schemaMarkup: item.schemaMarkup, generated: false });
  }
  return json({
    schemaMarkup: generateJsonLd(toJsonLdInput(item)),
    generated: true,
  });
});

/**
 * POST body:
 *   {} or { regenerate: true }  -> regenerate from content + persist
 *   { schemaMarkup: {...} }      -> validate (must be a JSON object) + persist
 */
const postSchema = z
  .object({
    regenerate: z.boolean().optional(),
    schemaMarkup: z.record(z.string(), z.any()).nullable().optional(),
  })
  .strict();

export const POST = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireCapability("edit_content", { isOwner: true });
  const { id } = await params;
  const item = await loadItem(id);

  // Row-state-aware ownership gate (403 on failure).
  assertCan(user.role, "edit_content", {
    isOwner: item.createdById === user.id,
  });

  const input = await parseBody(req, postSchema);

  let nextMarkup: object;
  if (input.schemaMarkup !== undefined && input.schemaMarkup !== null) {
    // Manual override. zod already proved it parsed as a JSON object; reject a
    // value that isn't a plain object (e.g. array) so invalid JSON-LD blocks the
    // schema field only. 422 -> field-level validation error.
    if (Array.isArray(input.schemaMarkup)) {
      throw new ValidationError("schemaMarkup must be a JSON object.", {
        errors: [{ field: "schemaMarkup", message: "Must be a JSON object." }],
      });
    }
    nextMarkup = input.schemaMarkup;
  } else {
    // Default / explicit regenerate -> derive from current content.
    nextMarkup = generateJsonLd(toJsonLdInput(item));
  }

  const updated = await prisma.contentItem.update({
    where: { id: item.id },
    data: {
      schemaMarkup: nextMarkup as object,
      updatedById: user.id,
    },
    select: { id: true, schemaMarkup: true },
  });

  await recordAudit({
    actorId: user.id,
    entityType: "content",
    entityId: item.id,
    action: "updated",
    diff: { schemaMarkup: input.schemaMarkup ? "manual" : "regenerated" },
  });

  return json({ schemaMarkup: updated.schemaMarkup, generated: !input.schemaMarkup });
});
