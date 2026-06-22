/**
 * Knowledge Base collection routes (FR-SETTINGS-02).
 *
 *   GET  /api/kb  — list items (filter by tag/status, paginated)
 *   POST /api/kb  — create an item (status=PROCESSING) then ingest it
 *
 * All routes require the `manage_knowledge_base` capability (ADMIN/EDITOR).
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withRoute, json, created, parseBody, parseQuery } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit/service";
import { ingestItem } from "@/lib/kb/ingest";
import { createKbItemSchema, listKbItemsQuerySchema } from "@/lib/kb/schemas";

export const runtime = "nodejs";

/** GET /api/kb — list knowledge base items. */
export const GET = withRoute(async (req: NextRequest) => {
  await requireCapability("manage_knowledge_base");

  const { tag, status, take, skip } = parseQuery(
    req.nextUrl.searchParams,
    listKbItemsQuerySchema
  );

  const where = {
    ...(status ? { status } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.knowledgeBaseItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { _count: { select: { chunks: true } } },
    }),
    prisma.knowledgeBaseItem.count({ where }),
  ]);

  return json({ items, total, take, skip });
});

/** POST /api/kb — create an item and run ingestion. */
export const POST = withRoute(async (req: NextRequest) => {
  const user = await requireCapability("manage_knowledge_base");
  const input = await parseBody(req, createKbItemSchema);

  // URL sources store the URL in rawContent; everything else stores its text.
  const rawContent = input.sourceType === "URL" ? input.url! : input.rawContent!;

  const item = await prisma.knowledgeBaseItem.create({
    data: {
      title: input.title,
      sourceType: input.sourceType,
      rawContent,
      tags: input.tags,
      status: "PROCESSING",
      createdById: user.id,
    },
  });

  await recordAudit({
    actorId: user.id,
    entityType: "kb",
    entityId: item.id,
    action: "created",
    diff: { title: item.title, sourceType: item.sourceType, tags: item.tags },
  });

  // Run ingestion synchronously so the response reflects the final status.
  // ingestItem sets status READY/FAILED internally; we never let an ingestion
  // failure roll back the created row — the FAILED item is the surfaced signal.
  let chunkCount = 0;
  let ingestError: string | undefined;
  try {
    const result = await ingestItem(item.id);
    chunkCount = result.chunkCount;
  } catch (err) {
    ingestError = err instanceof Error ? err.message : "Ingestion failed.";
  }

  const refreshed = await prisma.knowledgeBaseItem.findUnique({
    where: { id: item.id },
  });

  return created({ item: refreshed ?? item, chunkCount, ...(ingestError ? { ingestError } : {}) });
});
