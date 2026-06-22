/**
 * Knowledge Base re-index route (FR-SETTINGS-02).
 *
 *   POST /api/kb/:id/reindex — re-run ingestion (re-extract, re-chunk, re-embed).
 *
 * Sets the item back to PROCESSING and replaces its chunk set. Requires the
 * `manage_knowledge_base` capability.
 */
import { prisma } from "@/lib/db/prisma";
import { withRoute, json, NotFoundError } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit/service";
import { ingestItem } from "@/lib/kb/ingest";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/kb/:id/reindex — re-run the ingestion pipeline. */
export const POST = withRoute(async (_req: Request, ctx: RouteContext) => {
  const user = await requireCapability("manage_knowledge_base");
  const { id } = await ctx.params;

  const existing = await prisma.knowledgeBaseItem.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Knowledge base item not found.");

  // Reset to PROCESSING; ingestItem will flip to READY/FAILED.
  await prisma.knowledgeBaseItem.update({
    where: { id },
    data: { status: "PROCESSING" },
  });

  let chunkCount = 0;
  let ingestError: string | undefined;
  try {
    const result = await ingestItem(id);
    chunkCount = result.chunkCount;
  } catch (err) {
    ingestError = err instanceof Error ? err.message : "Ingestion failed.";
  }

  await recordAudit({
    actorId: user.id,
    entityType: "kb",
    entityId: id,
    action: "reindexed",
    diff: { chunkCount, ...(ingestError ? { ingestError } : {}) },
  });

  const refreshed = await prisma.knowledgeBaseItem.findUnique({ where: { id } });

  return json({ item: refreshed, chunkCount, ...(ingestError ? { ingestError } : {}) });
});
