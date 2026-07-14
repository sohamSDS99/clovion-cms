/**
 * Content Agent service — run lifecycle around the pipeline.
 */
import { prisma } from "@/lib/db/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/api/http";
import type { SessionUser } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit/service";
import { createContent } from "@/lib/content/service";
import { htmlToTiptap } from "@/lib/ai/coerce";
import { buildCourseSourceReport } from "@/lib/content/courseManager";
import { channelSpec, isValidPostType, isValidSocialFormat } from "./channels";
import { isValidSize } from "./sizes";
import { executeRun, learnFromRun } from "./pipeline";
import { extractArticleMeta } from "./prompts";
import type { CreateRunInput } from "./schemas";
import { Prisma } from "@prisma/client";
import type { AgentRun } from "@prisma/client";

/** Create a run and trigger execution in the background (fire-and-forget). */
export async function createRun(
  user: SessionUser,
  input: CreateRunInput
): Promise<AgentRun> {
  if (!isValidPostType(input.channel, input.postType)) {
    throw new BadRequestError(
      `Unknown post type "${input.postType}" for channel ${input.channel}.`
    );
  }
  if (channelSpec(input.channel).requiresSource && !input.sourceReport?.trim()) {
    throw new BadRequestError("This channel requires source material (the report).");
  }
  if (input.designSize && !isValidSize(input.channel, input.format ?? null, input.designSize)) {
    throw new BadRequestError(
      `Size ${input.designSize} isn't supported for this channel/format.`
    );
  }
  if (input.postType === "from-report" && !input.sourceReport?.trim()) {
    throw new BadRequestError(
      "A from-report article needs the report — paste it or attach the file."
    );
  }
  if (input.format && !isValidSocialFormat(input.channel, input.format)) {
    throw new BadRequestError(
      `Unknown format "${input.format}" for channel ${input.channel}.`
    );
  }

  // A run born targeting a course gets its source material composed for it:
  // the course's existing lessons (so the writer keeps continuity) unless the
  // caller supplied explicit source material.
  let sourceReport = input.sourceReport?.trim() || null;
  if (input.targetCourseSlug && !sourceReport) {
    sourceReport = await buildCourseSourceReport(input.targetCourseSlug);
  }

  const run = await prisma.agentRun.create({
    data: {
      channel: input.channel,
      postType: input.postType,
      format: input.format ?? null,
      allowResearch: input.allowResearch ?? true,
      keywords: input.keywords ?? [],
      designSize: input.designSize ?? null,
      brief: input.brief.trim(),
      sourceReport,
      targetCourseSlug: input.targetCourseSlug ?? null,
      createdById: user.id,
    },
  });

  await recordAudit({
    actorId: user.id,
    entityType: "agent_run",
    entityId: run.id,
    action: "created",
    diff: { channel: run.channel, postType: run.postType, format: run.format },
  });

  // In-process trigger; the worker poll is the safety net for lost triggers.
  void executeRun(run.id);
  return run;
}

export async function getRun(id: string): Promise<AgentRun> {
  const run = await prisma.agentRun.findUnique({ where: { id } });
  if (!run) throw new NotFoundError("Run not found.");
  return run;
}

export async function listRuns(opts: { cursor?: string; limit: number }) {
  const runs = await prisma.agentRun.findMany({
    orderBy: { createdAt: "desc" },
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = runs.length > opts.limit;
  return {
    data: hasMore ? runs.slice(0, opts.limit) : runs,
    nextCursor: hasMore ? runs[opts.limit - 1].id : null,
  };
}

/** Human edits the draft/caption directly; keeps status READY. */
export async function updateDraft(
  user: SessionUser,
  id: string,
  fields: { draftText?: string; specText?: string; captionText?: string }
): Promise<AgentRun> {
  const run = await getRun(id);
  if (run.status !== "READY") {
    throw new ConflictError("The draft can only be edited once the run is ready.");
  }
  const updated = await prisma.agentRun.update({
    where: { id },
    data: {
      ...(fields.draftText !== undefined ? { draftText: fields.draftText } : {}),
      ...(fields.specText !== undefined ? { specText: fields.specText } : {}),
      ...(fields.captionText !== undefined ? { captionText: fields.captionText } : {}),
    },
  });
  await recordAudit({
    actorId: user.id,
    entityType: "agent_run",
    entityId: id,
    action: "draft_edited",
  });
  return updated;
}

/** Approve a run: mark shipped + trigger the learning pass (fire-and-forget). */
export async function approveRun(user: SessionUser, id: string): Promise<AgentRun> {
  const run = await getRun(id);
  if (run.status !== "READY") {
    throw new ConflictError("Only finished runs can be approved.");
  }
  if (run.approvedAt) {
    throw new ConflictError("This run is already approved.");
  }
  const updated = await prisma.agentRun.update({
    where: { id },
    data: { approvedAt: new Date() },
  });
  await recordAudit({
    actorId: user.id,
    entityType: "agent_run",
    entityId: id,
    action: "approved",
  });
  void learnFromRun(id);
  return updated;
}

/** Active learned rules, newest first. */
export async function listLessons() {
  return prisma.agentLesson.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Deactivate a learned rule (kept for audit, no longer injected). */
export async function deactivateLesson(user: SessionUser, id: string): Promise<void> {
  const lesson = await prisma.agentLesson.findUnique({ where: { id } });
  if (!lesson) throw new NotFoundError("Lesson not found.");
  await prisma.agentLesson.update({ where: { id }, data: { isActive: false } });
  await recordAudit({
    actorId: user.id,
    entityType: "agent_run",
    entityId: id,
    action: "lesson_removed",
    diff: { lesson: lesson.lesson.slice(0, 120) },
  });
}

/** Replace the editable lesson plan on a course-outline run. */
export async function updateOutlineSyllabus(
  user: SessionUser,
  id: string,
  input: { courseTitle: string; lessons: { title: string; brief: string; assets?: unknown[] }[] }
): Promise<AgentRun> {
  const run = await getRun(id);
  if (run.postType !== "course-outline") {
    throw new ConflictError("Only course outlines carry a lesson plan.");
  }
  const lessons = input.lessons
    .filter((l) => l.title.trim().length > 0)
    .slice(0, 10)
    .map((l, i) => ({
      n: i + 1,
      title: l.title.trim().slice(0, 200),
      brief: (l.brief ?? "").trim().slice(0, 2000),
      assets: Array.isArray(l.assets) ? l.assets.slice(0, 3) : [],
    }));
  const updated = await prisma.agentRun.update({
    where: { id },
    data: {
      outlineSyllabus: {
        courseTitle: input.courseTitle.trim().slice(0, 200),
        lessons,
      } as Prisma.InputJsonValue,
    },
  });
  await recordAudit({
    actorId: user.id,
    entityType: "agent_run",
    entityId: id,
    action: "syllabus_edited",
    diff: { lessons: lessons.length },
  });
  return updated;
}

/** Re-run a finished/failed run fresh (new draft + QA), no feedback needed. */
export async function retryRun(user: SessionUser, id: string): Promise<AgentRun> {
  const run = await getRun(id);
  if (!["READY", "FAILED", "CANCELLED"].includes(run.status)) {
    throw new ConflictError("Let the current attempt finish before retrying.");
  }
  const updated = await prisma.agentRun.update({
    where: { id },
    data: {
      status: "QUEUED",
      // Fresh attempt: clear the prior plan/draft so the orchestrator + writer
      // start over (feedback history is preserved but not treated as a revision
      // round unless the user explicitly gave feedback).
      plan: Prisma.DbNull,
      draftText: null,
      specText: null,
      captionText: null,
      qaReport: Prisma.DbNull,
      error: Prisma.DbNull,
      feedback: [] as Prisma.InputJsonValue,
    },
  });
  await recordAudit({
    actorId: user.id,
    entityType: "agent_run",
    entityId: id,
    action: "retried",
  });
  void executeRun(id);
  return updated;
}

/** Stop a running generation at the next stage boundary. */
export async function cancelRun(user: SessionUser, id: string): Promise<AgentRun> {
  const res = await prisma.agentRun.updateMany({
    where: {
      id,
      status: { in: ["QUEUED", "PLANNING", "WRITING", "QA", "REVISING"] },
    },
    data: { status: "CANCELLED" },
  });
  if (res.count === 0) {
    throw new ConflictError("This run isn't generating — nothing to stop.");
  }
  await recordAudit({
    actorId: user.id,
    entityType: "agent_run",
    entityId: id,
    action: "cancelled",
  });
  return getRun(id);
}

/** Delete a finished (READY/FAILED/CANCELLED) run from the library. */
export async function deleteRun(user: SessionUser, id: string): Promise<void> {
  const run = await getRun(id);
  if (run.status !== "READY" && run.status !== "FAILED" && run.status !== "CANCELLED") {
    throw new ConflictError("Wait for the run to finish before deleting it.");
  }
  await prisma.agentRun.delete({ where: { id } });
  await recordAudit({
    actorId: user.id,
    entityType: "agent_run",
    entityId: id,
    action: "deleted",
    diff: { channel: run.channel, status: run.status },
  });
}

/** Send the run back through writer+QA with a human note. */
export async function submitFeedback(
  user: SessionUser,
  id: string,
  note: string
): Promise<AgentRun> {
  const run = await getRun(id);
  if (run.status !== "READY" && run.status !== "FAILED") {
    throw new ConflictError("Feedback can only be given once the run has finished.");
  }
  if (!run.draftText) {
    throw new ConflictError("There is no draft to revise — start a new run instead.");
  }
  const feedback = [
    ...((run.feedback ?? []) as unknown[]),
    { at: new Date().toISOString(), note, by: user.id },
  ];
  const updated = await prisma.agentRun.update({
    where: { id },
    data: {
      status: "QUEUED",
      feedback: feedback as Prisma.InputJsonValue,
      error: Prisma.DbNull,
    },
  });
  await recordAudit({
    actorId: user.id,
    entityType: "agent_run",
    entityId: id,
    action: "feedback_submitted",
  });
  void executeRun(id);
  return updated;
}

/** File an article run into the blog as a DRAFT ContentItem. */
export async function sendToBlog(
  user: SessionUser,
  id: string
): Promise<{ run: AgentRun; contentId: string }> {
  const run = await getRun(id);
  const spec = channelSpec(run.channel);
  if (spec.format !== "article" || !spec.cmsType) {
    throw new ConflictError("Only article-format runs can be filed into the CMS.");
  }
  if (run.status !== "READY" || !run.draftText) {
    throw new ConflictError("The run has no finished draft yet.");
  }
  if (run.contentId) {
    throw new ConflictError("This run was already sent to the blog.");
  }
  if (!user.authorProfileId) {
    throw new BadRequestError(
      "Your account has no author profile — set one up before filing articles."
    );
  }

  const { title, metaDescription, body } = extractArticleMeta(run.draftText);
  const { doc } = htmlToTiptap(body);
  const item = await createContent(
    user,
    {
      type: spec.cmsType,
      title: title ?? run.brief.slice(0, 120),
      body: doc as unknown as Record<string, unknown>,
      authorProfileId: user.authorProfileId,
      ...(title || metaDescription
        ? {
            seo: {
              ...(title ? { metaTitle: title.slice(0, 70) } : {}),
              ...(metaDescription
                ? { metaDescription: metaDescription.slice(0, 200) }
                : {}),
            },
          }
        : {}),
    },
    {
      revisionSource: "AI_GENERATION",
      revisionNote: `Content Agent run ${run.id}`,
    }
  );

  const updated = await prisma.agentRun.update({
    where: { id },
    data: { contentId: item.id },
  });
  await recordAudit({
    actorId: user.id,
    entityType: "agent_run",
    entityId: id,
    action: "sent_to_blog",
    diff: { contentId: item.id },
  });
  return { run: updated, contentId: item.id };
}
