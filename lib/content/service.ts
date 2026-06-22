/**
 * Content domain service (FR-CONTENT-01..11).
 *
 * Encapsulates all Prisma access for content CRUD + lifecycle transitions.
 * Authorization that depends on row state (ownership, status) lives here; the
 * coarse capability gate runs in the route via requireCapability.
 *
 * Lifecycle moves are delegated to lib/workflow (authorizeTransition,
 * validateForPublish, getTargetStatus) — never re-implement the state machine.
 */

import type {
  ContentItem,
  ContentRevision,
  ContentStatus,
  ContentType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/rbac";
import { assertCan } from "@/lib/auth/rbac";
import {
  authorizeTransition,
  getTargetStatus,
  validateForPublish,
  type PublishCandidate,
  type TransitionAction,
} from "@/lib/workflow";
import { recordAudit } from "@/lib/audit/service";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AuthzError,
  BadRequestError,
} from "@/lib/api/http";
import { getOrgPolicy } from "./policy";
import { ensureUniqueSlug, slugify } from "./slug";
import type {
  CreateContentInput,
  ListContentQuery,
  UpdateContentInput,
} from "./schemas";

const EMPTY_DOC: Prisma.InputJsonValue = {
  type: "doc",
  content: [],
};

/**
 * TODO(render hook): after a publish, the rendered/cached `bodyHtml` is produced
 * by a separate rendering module. We intentionally do NOT render HTML here.
 */
async function renderAndCache(_item: ContentItem): Promise<void> {
  // No-op placeholder — wired up by the rendering pipeline elsewhere.
}

/** Build a workflow PublishCandidate from a persisted ContentItem (FR-CONTENT-09). */
function toPublishCandidate(item: ContentItem): PublishCandidate {
  const seo = (item.seo ?? {}) as { metaTitle?: string; metaDescription?: string };
  const typeData = (item.typeData ?? {}) as Record<string, any>;
  return {
    type: item.type,
    title: item.title,
    slug: item.slug,
    // Slug uniqueness is enforced at write time via ensureUniqueSlug + the
    // DB unique constraint, so a persisted item is always unique in its type.
    slugUniqueInType: true,
    seo: { metaTitle: seo.metaTitle, metaDescription: seo.metaDescription },
    coverAssetId: item.coverAssetId,
    typeData,
  };
}

// ── Create (FR-CONTENT-01) ────────────────────────────────────────────────────

/**
 * Create a DRAFT content item plus its first MANUAL revision.
 *
 * FK cycle: ContentItem.currentRevisionId -> ContentRevision.id and
 * ContentRevision.contentId -> ContentItem.id form a cycle. We resolve it in a
 * single transaction: (1) insert the ContentItem (currentRevisionId null),
 * (2) insert the ContentRevision pointing at it, (3) update the item to point
 * currentRevisionId at the new revision.
 */
export async function createContent(
  user: SessionUser,
  input: CreateContentInput
): Promise<ContentItem> {
  // Byline defaults to the explicit author profile, else the acting user's own.
  const authorProfileId = input.authorProfileId ?? user.authorProfileId;
  if (!authorProfileId) {
    throw new BadRequestError(
      "An authorProfileId is required (none supplied and the user has no author profile)."
    );
  }

  const base = slugify(input.slug ?? input.title);
  const slug = await ensureUniqueSlug(input.type, base);

  const body = (input.body ?? EMPTY_DOC) as Prisma.InputJsonValue;
  const seo = (input.seo ?? {}) as Prisma.InputJsonValue;
  const typeData = (input.typeData ?? {}) as Prisma.InputJsonValue;

  const item = await prisma.$transaction(async (tx) => {
    // (1) ContentItem first — currentRevisionId left null to break the cycle.
    const createdItem = await tx.contentItem.create({
      data: {
        type: input.type,
        title: input.title,
        slug,
        body,
        excerpt: input.excerpt,
        coverAssetId: input.coverAssetId,
        status: "DRAFT",
        authorProfileId,
        seo,
        typeData,
        categoryId: input.categoryId,
        createdById: user.id,
        updatedById: user.id,
        ...(input.tags && input.tags.length > 0
          ? {
              tags: {
                connectOrCreate: input.tags.map((name) => ({
                  where: { slug: slugify(name) },
                  create: { name, slug: slugify(name) },
                })),
              },
            }
          : {}),
      },
    });

    // (2) First revision (MANUAL) referencing the new item.
    const revision = await tx.contentRevision.create({
      data: {
        contentId: createdItem.id,
        body,
        seo,
        typeData,
        source: "MANUAL",
        createdById: user.id,
      },
    });

    // (3) Point the item at its current revision, closing the cycle.
    return tx.contentItem.update({
      where: { id: createdItem.id },
      data: { currentRevisionId: revision.id },
    });
  });

  await recordAudit({
    actorId: user.id,
    entityType: "content",
    entityId: item.id,
    action: "created",
    diff: { type: item.type, title: item.title, slug: item.slug },
  });

  return item;
}

// ── Read (FR-CONTENT-03) ──────────────────────────────────────────────────────

/** Fetch a single non-deleted content item or throw 404. */
export async function getContent(id: string): Promise<ContentItem> {
  const item = await prisma.contentItem.findFirst({
    where: { id, deletedAt: null },
  });
  if (!item) throw new NotFoundError("Content not found.");
  return item;
}

export interface ListContentResult {
  items: ContentItem[];
  nextCursor: string | null;
}

/** List non-deleted content with cursor pagination + simple filters. */
export async function listContent(
  filters: ListContentQuery
): Promise<ListContentResult> {
  const limit = filters.limit ?? 20;
  const rows = await prisma.contentItem.findMany({
    where: {
      deletedAt: null,
      type: filters.type,
      status: filters.status,
      authorProfileId: filters.authorProfileId,
      ...(filters.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: "insensitive" } },
              { excerpt: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
}

// ── Update (FR-CONTENT-04, FR-CONTENT-05 autosave) ────────────────────────────

/**
 * Update content fields and append a new revision.
 *
 * Ownership: AUTHOR/CONTRIBUTOR may only edit content they created
 * (edit_content rule = OWN). ADMIN/EDITOR may edit anything. The capability
 * gate runs here with the resolved ownership context.
 *
 * Autosave (source === "autosave") is lightweight: it still writes a revision
 * (AUTOSAVE) and the body, but is otherwise the same path.
 */
export async function updateContent(
  user: SessionUser,
  id: string,
  input: UpdateContentInput
): Promise<ContentItem> {
  const existing = await getContent(id);
  const isOwner = existing.createdById === user.id;

  // Row-state-aware capability check (403 on failure).
  assertCan(user.role, "edit_content", { isOwner });

  // Resolve slug only when title/slug actually changed.
  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    slug = await ensureUniqueSlug(existing.type, slugify(input.slug), existing.id);
  } else if (input.title && !input.slug && input.title !== existing.title) {
    // Title changed without an explicit slug — only regenerate while still a
    // draft so we never silently break a published URL.
    if (existing.status === "DRAFT") {
      slug = await ensureUniqueSlug(existing.type, slugify(input.title), existing.id);
    }
  }

  const source = input.source === "autosave" ? "AUTOSAVE" : "MANUAL";

  // Merge seo/typeData so partial updates don't wipe untouched keys.
  const nextSeo = (input.seo ?? existing.seo) as Prisma.InputJsonValue;
  const nextTypeData = (input.typeData ?? existing.typeData) as Prisma.InputJsonValue;
  const nextBody = (input.body ?? existing.body) as Prisma.InputJsonValue;

  const item = await prisma.$transaction(async (tx) => {
    const revision = await tx.contentRevision.create({
      data: {
        contentId: existing.id,
        body: nextBody,
        seo: nextSeo,
        typeData: nextTypeData,
        revisionNote: input.revisionNote,
        source,
        createdById: user.id,
      },
    });

    return tx.contentItem.update({
      where: { id: existing.id },
      data: {
        title: input.title ?? undefined,
        slug,
        excerpt: input.excerpt === undefined ? undefined : input.excerpt,
        body: nextBody,
        coverAssetId:
          input.coverAssetId === undefined ? undefined : input.coverAssetId,
        categoryId:
          input.categoryId === undefined ? undefined : input.categoryId,
        seo: input.seo === undefined ? undefined : nextSeo,
        typeData: input.typeData === undefined ? undefined : nextTypeData,
        authorProfileId: input.authorProfileId ?? undefined,
        currentRevisionId: revision.id,
        updatedById: user.id,
        ...(input.tags
          ? {
              tags: {
                set: [],
                connectOrCreate: input.tags.map((name) => ({
                  where: { slug: slugify(name) },
                  create: { name, slug: slugify(name) },
                })),
              },
            }
          : {}),
      },
    });
  });

  await recordAudit({
    actorId: user.id,
    entityType: "content",
    entityId: item.id,
    action: "updated",
    diff: { source },
  });

  return item;
}

// ── Soft delete (FR-CONTENT-06) ───────────────────────────────────────────────

/**
 * Soft-delete content. AUTHOR may delete only their OWN DRAFT
 * (delete_content rule = OWN_DRAFT_ONLY); ADMIN/EDITOR may delete anything;
 * CONTRIBUTOR/VIEWER never.
 */
export async function softDeleteContent(
  user: SessionUser,
  id: string
): Promise<void> {
  const existing = await getContent(id);
  const isOwner = existing.createdById === user.id;
  const isDraft = existing.status === "DRAFT";

  if (!can(user.role, "delete_content", { isOwner, isDraft })) {
    throw new AuthzError(
      `Role "${user.role}" may not delete this content.`,
      403
    );
  }

  await prisma.contentItem.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), updatedById: user.id },
  });

  await recordAudit({
    actorId: user.id,
    entityType: "content",
    entityId: existing.id,
    action: "deleted",
  });
}

// ── Lifecycle transition (FR-CONTENT-08, FR-CONTENT-09) ───────────────────────

/** Actions that must pass the publish gate before proceeding. */
const PUBLISH_GATED: ReadonlySet<TransitionAction> = new Set([
  "publish_now",
  "approve_publish",
  "schedule",
]);

/**
 * Drive a content item through a lifecycle transition.
 *
 * Flow:
 *   1. Load item; compute isOwner + policy.
 *   2. authorizeTransition -> map code 409 to ConflictError, 403 to AuthzError.
 *   3. For publish-gated actions, run validateForPublish (422 on errors).
 *   4. Apply the state change (+ side effects: ScheduledJob, publishedAt).
 *   5. recordAudit content/status_changed {from,to}.
 *
 * Idempotency: publishing an already-PUBLISHED item is a no-op success.
 */
export async function transitionContent(
  user: SessionUser,
  id: string,
  action: TransitionAction,
  scheduledAt?: string
): Promise<ContentItem> {
  const item = await getContent(id);
  const from = item.status;

  // Idempotent publish: re-publishing an already-published item succeeds as a no-op.
  if (
    (action === "publish_now" || action === "approve_publish" || action === "auto_publish") &&
    from === "PUBLISHED"
  ) {
    return item;
  }

  const isOwner = item.createdById === user.id;
  const policy = getOrgPolicy();

  // 1+2. Combined state + role gate.
  const verdict = authorizeTransition({
    from,
    action,
    role: user.role,
    isOwner,
    policy,
    contentType: item.type,
  });
  if (!verdict.allowed) {
    if (verdict.code === 403) {
      throw new AuthzError(verdict.reason ?? "Transition not permitted.", 403);
    }
    // Default invalid-state move -> 409 Conflict.
    throw new ConflictError(verdict.reason ?? "Invalid lifecycle transition.");
  }

  // 3. Publish gate for publish/schedule actions (FR-CONTENT-09).
  if (PUBLISH_GATED.has(action)) {
    const result = validateForPublish(toPublishCandidate(item));
    if (!result.ok) {
      throw new ValidationError("Content is not ready to publish.", {
        errors: result.errors,
        warnings: result.warnings,
      });
    }
  }

  const target = getTargetStatus(from, action) as ContentStatus;

  // 4. Apply the state change with action-specific side effects.
  const updated = await prisma.$transaction(async (tx) => {
    const data: Prisma.ContentItemUpdateInput = {
      status: target,
      updatedById: user.id,
    };

    if (action === "schedule") {
      // schedule requires a future timestamp; create a PENDING PUBLISH job that
      // a separate worker will execute (we only persist intent here).
      if (!scheduledAt) {
        throw new ValidationError("scheduledAt is required to schedule.", {
          errors: [{ field: "scheduledAt", message: "scheduledAt is required." }],
        });
      }
      const runAt = new Date(scheduledAt);
      if (Number.isNaN(runAt.getTime()) || runAt.getTime() <= Date.now()) {
        throw new ValidationError("scheduledAt must be a valid future time.", {
          errors: [
            { field: "scheduledAt", message: "scheduledAt must be in the future." },
          ],
        });
      }
      data.scheduledAt = runAt;
      await tx.scheduledJob.create({
        data: {
          contentId: item.id,
          action: "PUBLISH",
          runAt,
          status: "PENDING",
        },
      });
    }

    if (action === "cancel_schedule") {
      // Clear the scheduled timestamp and cancel any pending publish jobs.
      data.scheduledAt = null;
      await tx.scheduledJob.updateMany({
        where: { contentId: item.id, action: "PUBLISH", status: "PENDING" },
        data: { status: "CANCELLED" },
      });
    }

    if (target === "PUBLISHED") {
      // Set publishedAt on first publish only; clear schedule.
      if (!item.publishedAt) data.publishedAt = new Date();
      data.scheduledAt = null;
    }

    return tx.contentItem.update({ where: { id: item.id }, data });
  });

  // TODO(render hook): regenerate + cache bodyHtml after publish. Rendering is
  // implemented elsewhere; this is intentionally a no-op call.
  if (target === "PUBLISHED") {
    await renderAndCache(updated);
  }

  // 5. Audit the status change.
  await recordAudit({
    actorId: user.id,
    entityType: "content",
    entityId: item.id,
    action: "status_changed",
    diff: { from, to: target, transition: action },
  });

  return updated;
}

// ── Revisions (FR-CONTENT-10) ─────────────────────────────────────────────────

/** List revisions for a content item, newest first. */
export async function listRevisions(id: string): Promise<ContentRevision[]> {
  await getContent(id); // 404 if missing/deleted
  return prisma.contentRevision.findMany({
    where: { contentId: id },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Restore a prior revision (FR-CONTENT-10): create a NEW MANUAL revision whose
 * snapshot equals the chosen one, then point the item at it. History is
 * append-only — we never mutate or delete the old revision.
 */
export async function restoreRevision(
  user: SessionUser,
  id: string,
  revisionId: string
): Promise<ContentItem> {
  const existing = await getContent(id);
  const isOwner = existing.createdById === user.id;

  // Restoring is an edit; gate accordingly.
  assertCan(user.role, "edit_content", { isOwner });

  const snapshot = await prisma.contentRevision.findFirst({
    where: { id: revisionId, contentId: id },
  });
  if (!snapshot) throw new NotFoundError("Revision not found for this content.");

  const item = await prisma.$transaction(async (tx) => {
    const restored = await tx.contentRevision.create({
      data: {
        contentId: existing.id,
        body: snapshot.body as Prisma.InputJsonValue,
        seo: snapshot.seo as Prisma.InputJsonValue,
        typeData: snapshot.typeData as Prisma.InputJsonValue,
        revisionNote: `Restored from revision ${snapshot.id}`,
        source: "MANUAL",
        createdById: user.id,
      },
    });

    return tx.contentItem.update({
      where: { id: existing.id },
      data: {
        body: snapshot.body as Prisma.InputJsonValue,
        seo: snapshot.seo as Prisma.InputJsonValue,
        typeData: snapshot.typeData as Prisma.InputJsonValue,
        currentRevisionId: restored.id,
        updatedById: user.id,
      },
    });
  });

  await recordAudit({
    actorId: user.id,
    entityType: "content",
    entityId: item.id,
    action: "revision_restored",
    diff: { fromRevisionId: revisionId },
  });

  return item;
}
