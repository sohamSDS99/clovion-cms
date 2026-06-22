/**
 * Lead form management + submission capture service
 * (FR §6.2 RESOURCE delta, NG3, NFR-SEC-03, PRD Q4).
 *
 * Admin CRUD records audit rows (entityType "config"). The public submit path
 * (`recordSubmission`) is the only writer of `LeadSubmission` and never stores a
 * raw client IP — only a one-way hash (NFR-SEC privacy). Issuing the signed PDF
 * URL is intentionally NOT done here: the public route does that *after* a valid
 * submission so the service stays free of storage concerns and stays testable.
 */
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/audit/service";
import { ConflictError, NotFoundError } from "@/lib/api/http";
import type { SessionUser } from "@/lib/auth/guard";
import type {
  CreateLeadFormInput,
  UpdateLeadFormInput,
  FieldDefinition,
} from "@/lib/leadform/schemas";

/** List all lead forms, newest-updated first. */
export async function listLeadForms() {
  return prisma.leadForm.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { submissions: true } } },
  });
}

/** Fetch one lead form (with submission count) or throw 404. */
export async function getLeadForm(id: string) {
  const form = await prisma.leadForm.findUnique({
    where: { id },
    include: { _count: { select: { submissions: true } } },
  });
  if (!form) throw new NotFoundError("Lead form not found.");
  return form;
}

/** Create a lead form. Caller must have already gated to ADMIN/EDITOR. */
export async function createLeadForm(user: SessionUser, input: CreateLeadFormInput) {
  const form = await prisma.leadForm.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      // `fields` is validated by createLeadFormSchema before reaching here.
      fields: input.fields as unknown as Prisma.InputJsonValue,
      isActive: input.isActive ?? true,
      createdById: user.id,
      updatedById: user.id,
    },
  });

  await recordAudit({
    actorId: user.id,
    entityType: "config",
    entityId: form.id,
    action: "created",
    diff: { name: form.name, fieldCount: input.fields.length },
  });

  return form;
}

/** Update a lead form (partial). Caller must have already gated to ADMIN/EDITOR. */
export async function updateLeadForm(
  user: SessionUser,
  id: string,
  input: UpdateLeadFormInput,
) {
  // Ensure it exists (404) before mutating.
  await getLeadForm(id);

  const data: Prisma.LeadFormUpdateInput = { updatedById: user.id };
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.fields !== undefined) {
    data.fields = input.fields as unknown as Prisma.InputJsonValue;
  }

  const form = await prisma.leadForm.update({ where: { id }, data });

  await recordAudit({
    actorId: user.id,
    entityType: "config",
    entityId: form.id,
    action: "updated",
    diff: {
      fields: Object.keys(input),
      ...(input.fields ? { fieldCount: input.fields.length } : {}),
    },
  });

  return form;
}

/**
 * Find published RESOURCE items that reference this lead form via
 * `typeData.leadFormId`. Used to soft-guard deletion.
 *
 * Prisma's JSON filtering on Postgres supports `path`/`equals`, so we can do
 * this in the DB rather than scanning every resource.
 */
export async function resourcesUsingLeadForm(leadFormId: string) {
  return prisma.contentItem.findMany({
    where: {
      type: "RESOURCE",
      deletedAt: null,
      status: "PUBLISHED",
      typeData: {
        path: ["leadFormId"],
        equals: leadFormId,
      },
    },
    select: { id: true, title: true, slug: true },
  });
}

/**
 * Delete a lead form. Soft-guard: refuse (409) when a PUBLISHED gated resource
 * still references it, so we never orphan a live gate. `submissions` cascade.
 */
export async function deleteLeadForm(user: SessionUser, id: string) {
  const form = await getLeadForm(id);

  const inUse = await resourcesUsingLeadForm(id);
  if (inUse.length > 0) {
    throw new ConflictError(
      "This lead form is in use by published gated resources. Detach it first.",
      { references: inUse.map((r) => ({ type: "content", id: r.id, title: r.title })) },
    );
  }

  await prisma.leadForm.delete({ where: { id } });

  await recordAudit({
    actorId: user.id,
    entityType: "config",
    entityId: id,
    action: "deleted",
    diff: { name: form.name },
  });
}

export interface ListSubmissionsParams {
  limit?: number;
  cursor?: string;
}

/** List a form's submissions, newest-first, cursor-paginated. */
export async function listSubmissions(
  leadFormId: string,
  params: ListSubmissionsParams = {},
) {
  // Ensure the form exists so callers get a clean 404 instead of an empty page.
  await getLeadForm(leadFormId);

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const rows = await prisma.leadSubmission.findMany({
    where: { leadFormId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
}

export interface RecordSubmissionInput {
  leadFormId: string;
  contentId?: string | null;
  email: string;
  data: Record<string, unknown>;
  /** Already-hashed (never raw) client IP, or null. */
  ipHash?: string | null;
}

/**
 * Persist one lead submission. The PUBLIC endpoint calls this AFTER validating
 * the body against `buildSubmissionSchema`. Stores only the hashed IP.
 */
export async function recordSubmission(input: RecordSubmissionInput) {
  return prisma.leadSubmission.create({
    data: {
      leadFormId: input.leadFormId,
      contentId: input.contentId ?? null,
      email: input.email,
      data: input.data as Prisma.InputJsonValue,
      ipHash: input.ipHash ?? null,
    },
  });
}

/**
 * One-way hash of a client IP for abuse analysis without storing PII.
 * Salted with LEAD_IP_HASH_SALT so hashes aren't reversible via a rainbow table
 * of the (small) IPv4 space. Returns null when no IP is available.
 */
export function hashClientIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.LEAD_IP_HASH_SALT ?? "clovion-lead";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/**
 * Extract the best-effort client IP from request headers (behind a proxy/CDN).
 * Prefers the first hop of X-Forwarded-For, then X-Real-IP.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}

/** Read a RESOURCE's gating config from its `typeData`. */
export interface ResourceGateConfig {
  gated: boolean;
  leadFormId: string | null;
  pdfAssetId: string | null;
  fileLabel: string | null;
}

export function readResourceGate(typeData: unknown): ResourceGateConfig {
  const td = (typeData ?? {}) as Record<string, unknown>;
  const leadFormId = typeof td.leadFormId === "string" ? td.leadFormId : null;
  return {
    gated: Boolean(td.gated) || Boolean(leadFormId),
    leadFormId,
    pdfAssetId: typeof td.pdfAssetId === "string" ? td.pdfAssetId : null,
    fileLabel: typeof td.fileLabel === "string" ? td.fileLabel : null,
  };
}

/** Public-safe projection of a lead form definition for site rendering. */
export interface PublicLeadForm {
  id: string;
  name: string;
  description: string | null;
  fields: FieldDefinition[];
}

export function toPublicLeadForm(form: {
  id: string;
  name: string;
  description: string | null;
  fields: unknown;
}): PublicLeadForm {
  return {
    id: form.id,
    name: form.name,
    description: form.description,
    fields: (Array.isArray(form.fields) ? form.fields : []) as FieldDefinition[],
  };
}
