/** Generate the "what it covers" brief for one lesson title (synchronous). */
import { z } from "zod";
import { withRoute, parseBody, json, NotFoundError, ConflictError } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import {
  getConfig,
  getDecryptedAnthropicKey,
  getDecryptedOpenaiKey,
} from "@/lib/ai/config";
import { callRole, resolveAgentModels } from "@/lib/contentagent/pipeline";
import {
  expandLessonMessages,
  parseJsonOutput,
  type Syllabus,
} from "@/lib/contentagent/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ index: z.number().int().min(0).max(9) }).strict();

export const POST = withRoute(async (req: Request, ctx: Ctx) => {
  await requireCapability("use_ai_write");
  const { id } = await ctx.params;
  const { index } = await parseBody(req, bodySchema);

  const run = await prisma.agentRun.findUnique({ where: { id } });
  if (!run) throw new NotFoundError("Run not found.");
  const syllabus = run.outlineSyllabus as unknown as Syllabus | null;
  const lesson = syllabus?.lessons?.[index];
  if (!syllabus || !lesson?.title?.trim()) {
    throw new ConflictError("Save the lesson (with a title) before generating its summary.");
  }

  const config = await getConfig();
  const keys = {
    anthropic: await getDecryptedAnthropicKey(),
    openai: await getDecryptedOpenaiKey(),
  };
  const models = resolveAgentModels(
    (config as unknown as { agentModels?: unknown }).agentModels
  );
  const res = await callRole(
    keys,
    models.orchestrator,
    expandLessonMessages({
      courseTitle: syllabus.courseTitle ?? run.brief.slice(0, 120),
      lessonTitle: lesson.title,
      outlineText: run.draftText ?? "",
      otherLessons: syllabus.lessons
        .filter((_, i) => i !== index)
        .map((l) => ({ title: l.title, brief: l.brief ?? "" })),
    }),
    4000
  );
  const { brief } = parseJsonOutput<{ brief: string }>(res.text);
  syllabus.lessons[index] = { ...lesson, brief: brief.slice(0, 2000) };
  const updated = await prisma.agentRun.update({
    where: { id },
    data: { outlineSyllabus: syllabus as never },
  });
  return json({ data: updated });
});
