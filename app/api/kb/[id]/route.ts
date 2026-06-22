/**
 * Knowledge Base item routes (FR-SETTINGS-02).
 *
 *   GET    /api/kb/:id  — fetch one item with its chunk count
 *   DELETE /api/kb/:id  — delete the item (chunks cascade via FK onDelete)
 *
 * Requires the `manage_knowledge_base` capability.
 */
import { prisma } from "@/lib/db/prisma";
import { withRoute, json, noContent, NotFoundError } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/kb/:id — item + chunk count. */
export const GET = withRoute(async (_req: Request, ctx: RouteContext) => {
  await requireCapability("manage_knowledge_base");
  const { id } = await ctx.params;

  const item = await prisma.knowledgeBaseItem.findUnique({
    where: { id },
    include: { _count: { select: { chunks: true } } },
  });
  if (!item) throw new NotFoundError("Knowledge base item not found.");

  return json({ item, chunkCount: item._count.chunks });
});

/** DELETE /api/kb/:id — delete item; chunks cascade (schema onDelete: Cascade). */
export const DELETE = withRoute(async (_req: Request, ctx: RouteContext) => {
  const user = await requireCapability("manage_knowledge_base");
  const { id } = await ctx.params;

  // Ensure it exists so we return 404 (not a silent no-op) for unknown ids.
  const existing = await prisma.knowledgeBaseItem.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Knowledge base item not found.");

  await prisma.knowledgeBaseItem.delete({ where: { id } });

  await recordAudit({
    actorId: user.id,
    entityType: "kb",
    entityId: id,
    action: "deleted",
    diff: { title: existing.title },
  });

  return noContent();
});
