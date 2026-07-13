/**
 * Content Agent service — run lifecycle around the pipeline.
 */
import { prisma } from "@/lib/db/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/api/http";
import type { SessionUser } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit/service";
import { createContent } from "@/lib/content/service";
import { htmlToTiptap } from "@/lib/ai/coerce";
import { channelSpec, isValidPostType, isValidSocialFormat } from "./channels";
import { executeRun, learnFromRun } from "./pipeline";
import { extractArticleTitle } from "./prompts";
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
  if (input.format && !isValidSocialFormat(input.channel, input.format)) {
    throw new BadRequestError(
      `Unknown format "${input.format}" for channel ${input.channel}.`
    );
  }

  const run = await prisma.agentRun.create({
    data: {
      channel: input.channel,
      postType: input.postType,
      format: input.format ?? null,
      allowResearch: input.allowResearch ?? true,
      brief: input.brief.trim(),
      sourceReport: input.sourceReport?.trim() || null,
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

/** Delete a finished (READY/FAILED) run from the library. */
export async function deleteRun(user: SessionUser, id: string): Promise<void> {
  const run = await getRun(id);
  if (run.status !== "READY" && run.status !== "FAILED") {
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

  const { title, body } = extractArticleTitle(run.draftText);
  const { doc } = htmlToTiptap(body);
  const item = await createContent(
    user,
    {
      type: spec.cmsType,
      title: title ?? run.brief.slice(0, 120),
      body: doc as unknown as Record<string, unknown>,
      authorProfileId: user.authorProfileId,
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
