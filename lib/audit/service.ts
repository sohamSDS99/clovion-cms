/**
 * Append-only audit log service (FR-USER-04, NFR-SEC-04).
 *
 * Every status change, publish, user/role change, and SOP/KB/config edit must
 * record an audit row. Audit rows are never updated or hard-deleted.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type AuditEntityType =
  | "content"
  | "user"
  | "media"
  | "sop"
  | "kb"
  | "config"
  | "author_profile";

export interface RecordAuditInput {
  actorId?: string | null;
  entityType: AuditEntityType;
  entityId: string;
  /** e.g. "created", "updated", "status_changed", "published", "deleted". */
  action: string;
  /** Optional before/after or contextual detail. */
  diff?: unknown;
}

/**
 * Writes one audit row. Best-effort by default: auditing must never break the
 * primary operation, so failures are logged and swallowed unless `strict`.
 * Pass an existing Prisma transaction client as `tx` to record inside a txn.
 */
export async function recordAudit(
  input: RecordAuditInput,
  opts?: { strict?: boolean; tx?: Prisma.TransactionClient }
): Promise<void> {
  const db = opts?.tx ?? prisma;
  try {
    await db.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        diff: input.diff === undefined ? undefined : (input.diff as object),
      },
    });
  } catch (error) {
    if (opts?.strict) throw error;
    console.error("[audit] failed to record audit row:", error, input);
  }
}

export interface ListAuditFilters {
  entityType?: AuditEntityType;
  entityId?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  cursor?: string;
}

/** Lists audit rows newest-first with cursor pagination (Admin/Editor only). */
export async function listAudit(filters: ListAuditFilters = {}) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const rows = await prisma.auditLog.findMany({
    where: {
      entityType: filters.entityType,
      entityId: filters.entityId,
      actorId: filters.actorId,
      at:
        filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
    },
    orderBy: { at: "desc" },
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null };
}
