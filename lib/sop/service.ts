/**
 * Writing SOP management service (FR-SETTINGS-01, §10 Q8 per-type SOP).
 *
 * Invariants / capability split (critical correctness points):
 *  - Exactly ONE active SOP per ContentType. Enforced at activation time by
 *    deactivating every other active SOP whose `appliesTo` overlaps.
 *  - EDITORs may create/edit/delete SOPs (`edit_writing_sop`) but may NOT
 *    activate them — activation requires `activate_writing_sop` (ADMIN only).
 */
import type { ContentType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireCapability, type SessionUser } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit/service";
import { ConflictError, NotFoundError } from "@/lib/api/http";
import { sopsToDeactivate } from "@/lib/sop/logic";
import type { CreateSopInput, UpdateSopInput } from "@/lib/sop/schemas";

export interface ListSopFilters {
  appliesTo?: ContentType;
  activeOnly?: boolean;
}

/** List SOPs, newest-first, optionally filtered by content type / active flag. */
export async function listSops(filters: ListSopFilters = {}) {
  return prisma.writingSOP.findMany({
    where: {
      isActive: filters.activeOnly ? true : undefined,
      appliesTo: filters.appliesTo ? { has: filters.appliesTo } : undefined,
    },
    orderBy: { updatedAt: "desc" },
  });
}

/** Fetch one SOP or throw 404. */
export async function getSop(id: string) {
  const sop = await prisma.writingSOP.findUnique({ where: { id } });
  if (!sop) throw new NotFoundError("Writing SOP not found.");
  return sop;
}

/** Create a new SOP (version 1, inactive). Requires `edit_writing_sop`. */
export async function createSop(user: SessionUser, input: CreateSopInput) {
  await requireCapability("edit_writing_sop");

  const sop = await prisma.writingSOP.create({
    data: {
      name: input.name,
      body: input.body,
      appliesTo: input.appliesTo,
      isActive: false,
      version: 1,
      createdById: user.id,
      updatedById: user.id,
    },
  });

  await recordAudit({
    actorId: user.id,
    entityType: "sop",
    entityId: sop.id,
    action: "created",
    diff: { name: sop.name, appliesTo: sop.appliesTo, version: sop.version },
  });

  return sop;
}

/**
 * Update an SOP. Each save bumps `version` (current + 1).
 * Requires `edit_writing_sop` (EDITOR allowed). Does NOT change isActive.
 */
export async function updateSop(
  user: SessionUser,
  id: string,
  input: UpdateSopInput
) {
  await requireCapability("edit_writing_sop");

  const existing = await getSop(id);

  const sop = await prisma.writingSOP.update({
    where: { id },
    data: {
      name: input.name ?? undefined,
      body: input.body ?? undefined,
      appliesTo: input.appliesTo ?? undefined,
      version: existing.version + 1,
      updatedById: user.id,
    },
  });

  await recordAudit({
    actorId: user.id,
    entityType: "sop",
    entityId: sop.id,
    action: "updated",
    diff: { version: sop.version },
  });

  return sop;
}

/**
 * Activate an SOP and enforce one-active-per-type: in a single transaction,
 * set this SOP active and deactivate every OTHER active SOP whose appliesTo
 * overlaps any of this SOP's content types.
 *
 * Requires `activate_writing_sop` (ADMIN only — EDITOR is denied).
 * Returns the activated SOP plus the ids that were deactivated.
 */
export async function activateSop(user: SessionUser, id: string) {
  await requireCapability("activate_writing_sop");

  // Ensures 404 before opening a transaction.
  const target = await getSop(id);

  const result = await prisma.$transaction(async (tx) => {
    // Other SOPs currently active that could collide on a content type.
    const otherActive = await tx.writingSOP.findMany({
      where: { isActive: true, id: { not: id } },
      select: { id: true, appliesTo: true },
    });

    const deactivatedIds = sopsToDeactivate(target.appliesTo, otherActive);

    if (deactivatedIds.length > 0) {
      await tx.writingSOP.updateMany({
        where: { id: { in: deactivatedIds } },
        data: { isActive: false, updatedById: user.id },
      });
    }

    const activated = await tx.writingSOP.update({
      where: { id },
      data: { isActive: true, updatedById: user.id },
    });

    return { activated, deactivatedIds };
  });

  await recordAudit({
    actorId: user.id,
    entityType: "sop",
    entityId: id,
    action: "status_changed",
    diff: { activated: true, deactivated: result.deactivatedIds },
  });

  return result;
}

/**
 * The single active SOP governing a content type (used by the generation
 * engine later), or null. The one-active-per-type invariant means there is at
 * most one; if data drift produced several, the most recently updated wins.
 */
export async function getActiveSopForType(contentType: ContentType) {
  return prisma.writingSOP.findFirst({
    where: { isActive: true, appliesTo: { has: contentType } },
    orderBy: { updatedAt: "desc" },
  });
}

/* ── Master writing style (single org-wide prompt) ──────────────────────────
 * The Settings → "Writing Style" tab manages ONE master prompt that the AI
 * follows for every content type. It is modeled as a single, always-active
 * WritingSOP named MASTER_SOP_NAME applied to all five types, so it flows
 * through the existing generation pipeline (`getActiveSopForType`) unchanged.
 */
export const MASTER_SOP_NAME = "Master Writing Style";

const ALL_CONTENT_TYPES: ContentType[] = [
  "BLOG",
  "WEBINAR",
  "NEWS",
  "RESOURCE",
  "FAQ",
];

/** The current master writing-style prompt body (empty string if unset). */
export async function getMasterWritingStyle(): Promise<{
  body: string;
  updatedAt: Date | null;
}> {
  const sop =
    (await prisma.writingSOP.findFirst({
      where: { name: MASTER_SOP_NAME },
      orderBy: { updatedAt: "desc" },
    })) ??
    (await prisma.writingSOP.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    }));
  return { body: sop?.body ?? "", updatedAt: sop?.updatedAt ?? null };
}

/**
 * Upsert the master writing-style prompt. Requires `edit_writing_sop`
 * (ADMIN/EDITOR). The master SOP is applied to ALL content types and set
 * active; every OTHER active SOP is deactivated so the master alone governs
 * generation (preserves the one-active-per-type invariant).
 */
export async function setMasterWritingStyle(user: SessionUser, body: string) {
  await requireCapability("edit_writing_sop");

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.writingSOP.findFirst({
      where: { name: MASTER_SOP_NAME },
      orderBy: { updatedAt: "desc" },
    });

    const master = existing
      ? await tx.writingSOP.update({
          where: { id: existing.id },
          data: {
            body,
            appliesTo: ALL_CONTENT_TYPES,
            isActive: true,
            version: existing.version + 1,
            updatedById: user.id,
          },
        })
      : await tx.writingSOP.create({
          data: {
            name: MASTER_SOP_NAME,
            body,
            appliesTo: ALL_CONTENT_TYPES,
            isActive: true,
            version: 1,
            createdById: user.id,
            updatedById: user.id,
          },
        });

    // Deactivate any other active SOP so the master alone governs generation.
    await tx.writingSOP.updateMany({
      where: { isActive: true, id: { not: master.id } },
      data: { isActive: false, updatedById: user.id },
    });

    return master;
  });

  await recordAudit({
    actorId: user.id,
    entityType: "sop",
    entityId: result.id,
    action: "updated",
    diff: { master: true, version: result.version },
  });

  return { body: result.body, updatedAt: result.updatedAt };
}

/**
 * Delete an SOP. Requires `edit_writing_sop`. An active SOP must be
 * deactivated first (409) so we never silently remove a governing SOP.
 */
export async function deleteSop(user: SessionUser, id: string) {
  await requireCapability("edit_writing_sop");

  const sop = await getSop(id);
  if (sop.isActive) {
    throw new ConflictError(
      "Cannot delete an active SOP. Deactivate it first."
    );
  }

  await prisma.writingSOP.delete({ where: { id } });

  await recordAudit({
    actorId: user.id,
    entityType: "sop",
    entityId: id,
    action: "deleted",
    diff: { name: sop.name, version: sop.version },
  });
}
