/**
 * GET /api/ai/jobs/[id] — AIGenerationJob status + output (poll fallback).
 *
 * Lets the editor recover a generation result when the SSE stream was
 * interrupted. Requires an authenticated user (`requireUser`). Returns a
 * client-safe view of the job: status, the coerced Tiptap output, token/cost
 * usage, lowGrounding, prompt provenance, and any error.
 */
import type { NextRequest } from "next/server";
import { withRoute, json, NotFoundError } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (_req: NextRequest, { params }: Ctx) => {
  await requireUser();
  const { id } = await params;

  const job = await prisma.aIGenerationJob.findUnique({ where: { id } });
  if (!job) throw new NotFoundError("AI generation job not found.");

  return json({
    id: job.id,
    contentId: job.contentId,
    mode: job.mode,
    model: job.model,
    status: job.status,
    tiptap: job.outputTiptap,
    lowGrounding: job.lowGrounding,
    usage: {
      promptTokens: job.tokensPrompt,
      completionTokens: job.tokensCompletion,
      costUsd: job.costUsd ? Number(job.costUsd) : 0,
    },
    promptAssembly: job.promptAssembly,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});
