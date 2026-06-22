/**
 * GET /api/audit — view the append-only audit log (FR-USER-04).
 * Admin/Editor only (view_audit_log). Filter by entity, actor, and date.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withRoute, json, parseQuery } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { listAudit, type AuditEntityType } from "@/lib/audit/service";

export const runtime = "nodejs";

const querySchema = z.object({
  entityType: z
    .enum(["content", "user", "media", "sop", "kb", "config", "author_profile"])
    .optional(),
  entityId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export const GET = withRoute(async (req: NextRequest) => {
  await requireCapability("view_audit_log");
  const q = parseQuery(req.nextUrl.searchParams, querySchema);
  const result = await listAudit({
    entityType: q.entityType as AuditEntityType | undefined,
    entityId: q.entityId,
    actorId: q.actorId,
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
    limit: q.limit,
    cursor: q.cursor,
  });
  return json(result);
});
