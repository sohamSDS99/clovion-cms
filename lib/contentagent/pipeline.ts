/**
 * Content Agent pipeline — orchestrator → writer → QA (→ revise → QA).
 *
 * Runs as a background task. State lives in AgentRun; execution is idempotent
 * via an atomic QUEUED→PLANNING claim, so the in-process trigger and the
 * worker poll can never double-run the same run.
 *
 * HARD RULE: output never touches ContentItem status. "Send to blog" is a
 * separate, human-triggered action that creates a DRAFT.
 */
import { prisma } from "@/lib/db/prisma";
import {
  getConfig,
  getDecryptedAnthropicKey,
  getDecryptedOpenaiKey,
} from "@/lib/ai/config";
import type { ChatMessage, Usage } from "@/lib/ai/openrouter";
import {
  chatComplete,
  providerForModel,
  type ProviderKeys,
} from "@/lib/ai/providers";
import { retrieveChunks } from "@/lib/kb/retrieve";
import { channelSpec } from "./channels";
import {
  DEFAULT_AGENT_MODELS,
  type AgentRole,
  orchestratorMessages,
  writerMessages,
  reviserMessages,
  qaMessages,
  feedbackReviserMessages,
  parseJsonOutput,
  splitDeliverable,
  joinDeliverable,
  stripImageMarkers,
  lessonsBlock,
  learnerMessages,
  syllabusMessages,
  MAX_LESSONS,
  type Syllabus,
} from "./prompts";
import { Prisma } from "@prisma/client";
import type { AgentRun, AgentRunStatus } from "@prisma/client";

export const MAX_AUTO_REVISIONS = 2;

export interface QaReport {
  pass: boolean;
  scores: Record<string, number>;
  requiredFixes: string[];
  notes: string;
}

/** Resolve per-role models: Settings override → default. */
export function resolveAgentModels(
  agentModels: unknown
): Record<AgentRole, string> {
  const overrides = (agentModels ?? {}) as Partial<Record<AgentRole, string>>;
  return {
    orchestrator: overrides.orchestrator || DEFAULT_AGENT_MODELS.orchestrator,
    writer: overrides.writer || DEFAULT_AGENT_MODELS.writer,
    qa: overrides.qa || DEFAULT_AGENT_MODELS.qa,
  };
}

interface RoleCallResult {
  text: string;
  usage: Usage | undefined;
}

export async function callRole(
  keys: ProviderKeys,
  model: string,
  messages: ChatMessage[],
  maxTokens: number
): Promise<RoleCallResult> {
  return callRoleWithSearch(keys, model, messages, maxTokens, undefined);
}

async function callRoleWithSearch(
  keys: ProviderKeys,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  webSearch: { maxUses: number } | undefined
): Promise<RoleCallResult> {
  // One retry on transient failures (429/5xx/network) and on truncation
  // (reasoning models share the token budget with output; double and retry).
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const budget = attempt === 0 ? maxTokens : maxTokens * 2;
      const result = await chatComplete(keys, {
        model,
        messages,
        maxTokens: budget,
        ...(webSearch ? { webSearch } : {}),
      });
      if (result.truncated) {
        throw new Error(
          `Output from ${model} hit the ${budget}-token limit and was cut off.`
        );
      }
      if (!result.text.trim()) throw new Error(`Empty response from ${model}.`);
      return { text: result.text, usage: result.usage };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      if (status !== undefined && status < 500 && status !== 429) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/** Thrown internally when a run was cancelled by the user mid-pipeline. */
class RunCancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

/** Status write that respects cancellation: throws if the run was cancelled. */
async function setStatus(runId: string, status: AgentRunStatus, extra?: Prisma.AgentRunUpdateInput) {
  const res = await prisma.agentRun.updateMany({
    where: { id: runId, NOT: { status: "CANCELLED" } },
    data: { status, ...extra },
  });
  if (res.count === 0) throw new RunCancelled();
}

/** Cheap cancellation check between expensive model calls. */
async function assertNotCancelled(runId: string): Promise<void> {
  const row = await prisma.agentRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });
  if (row?.status === "CANCELLED") throw new RunCancelled();
}

function usageTotals(usages: (Usage | undefined)[]) {
  return usages.reduce(
    (acc, u) => ({
      prompt: acc.prompt + (u?.prompt_tokens ?? 0),
      completion: acc.completion + (u?.completion_tokens ?? 0),
      cost: acc.cost + (u?.cost ?? 0),
    }),
    { prompt: 0, completion: 0, cost: 0 }
  );
}

/**
 * Execute a run end-to-end. Safe to call multiple times: only one caller wins
 * the QUEUED claim; others return immediately.
 */
export async function executeRun(runId: string): Promise<void> {
  const claim = await prisma.agentRun.updateMany({
    where: { id: runId, status: "QUEUED" },
    data: { status: "PLANNING" },
  });
  if (claim.count === 0) return; // someone else has it (or it's not queued)

  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
  if (!run) return;

  const usages: (Usage | undefined)[] = [];
  try {
    const config = await getConfig();
    const keys: ProviderKeys = {
      anthropic: await getDecryptedAnthropicKey(),
      openai: await getDecryptedOpenaiKey(),
    };
    const models = resolveAgentModels(
      (config as unknown as { agentModels?: unknown }).agentModels
    );
    // Fail fast with a precise setup message before any call.
    const needed = new Set(
      Object.values(models).map((m) => providerForModel(m))
    );
    const missing: string[] = [];
    if (needed.has("anthropic") && !keys.anthropic) missing.push("Anthropic");
    if (needed.has("openai") && !keys.openai) missing.push("OpenAI");
    if (missing.length > 0) {
      throw new Error(
        `${missing.join(" and ")} API key${missing.length > 1 ? "s are" : " is"} not configured. Add ${missing.length > 1 ? "them" : "it"} in Settings → AI Provider.`
      );
    }
    const spec = channelSpec(run.channel);
    const maxTokens =
      spec.maxOutputTokens ?? (spec.format === "article" ? 16000 : 8000);

    // Learned style rules from approved runs (the auto-improvement loop).
    const lessonRows = await prisma.agentLesson.findMany({
      where: { channel: run.channel, isActive: true },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { lesson: true },
    });
    const lessons = lessonsBlock(lessonRows.map((l) => l.lesson));

    // Optional grounding from the knowledge base (best-effort).
    let knowledge = "";
    try {
      const { chunks } = await retrieveChunks(run.brief, { k: 5 });
      if (chunks.length > 0) {
        knowledge = `\n\nKNOWLEDGE CONTEXT (verified product/brand facts you may use):\n${chunks
          .map((c) => `- ${c.chunkText}`)
          .join("\n")}`;
      }
    } catch {
      // KB unavailable (no embeddings yet) — proceed ungrounded.
    }

    // 1 — Orchestrator plans.
    const feedbackList = (run.feedback ?? []) as { note: string }[];
    const isFeedbackRound = Boolean(run.plan && run.draftText && feedbackList.length > 0);
    const previousCombined = joinDeliverable(run.draftText, run.specText, run.captionText);
    let plan = run.plan as unknown;
    if (!isFeedbackRound) {
      const planMsgs = orchestratorMessages(run);
      if (lessons) planMsgs[0].content += lessons;
      if (knowledge) planMsgs[1].content += knowledge;
      const planRes = await callRoleWithSearch(
        keys,
        models.orchestrator,
        planMsgs,
        8000,
        run.allowResearch ? { maxUses: 3 } : undefined
      );
      await assertNotCancelled(runId);
      usages.push(planRes.usage);
      plan = parseJsonOutput(planRes.text);
      // Store the orchestrator's size recommendation when the user left it on auto.
      const rec = (plan as { recommendedSize?: string }).recommendedSize?.match(/\d{3,4}x\d{3,4}/)?.[0];
      await setStatus(runId, "WRITING", {
        plan: plan as Prisma.InputJsonValue,
        ...(rec && !run.designSize ? { designSize: rec } : {}),
      });
    } else {
      await setStatus(runId, "REVISING");
    }

    // 2 — Writer drafts (or revises against human feedback).
    let draftMsgs: ChatMessage[];
    if (isFeedbackRound) {
      const lastNote = feedbackList[feedbackList.length - 1]?.note ?? "";
      draftMsgs = feedbackReviserMessages(run, plan, previousCombined, lastNote);
    } else {
      draftMsgs = writerMessages(run, plan);
      if (knowledge) draftMsgs[1].content += knowledge;
    }
    if (lessons) draftMsgs[0].content += lessons;
    const draftRes = await callRole(keys, models.writer, draftMsgs, maxTokens);
    await assertNotCancelled(runId);
    usages.push(draftRes.usage);
    let draft = draftRes.text.trim();

    // 3 — QA loop with bounded auto-revision.
    let qaReport: QaReport | null = null;
    let rounds = 0;
    for (;;) {
      await setStatus(runId, "QA", { draftText: draft });
      const findings = (plan as { researchFindings?: unknown[] } | null)
        ?.researchFindings;
      const qaRes = await callRoleWithSearch(
        keys,
        models.qa,
        qaMessages(run, draft, findings),
        8000,
        spec.format === "article" && run.allowResearch ? { maxUses: 3 } : undefined
      );
      usages.push(qaRes.usage);
      await assertNotCancelled(runId);
      qaReport = parseJsonOutput<QaReport>(qaRes.text);
      if (qaReport.pass || rounds >= MAX_AUTO_REVISIONS) break;

      rounds += 1;
      await setStatus(runId, "REVISING", {
        qaReport: qaReport as unknown as Prisma.InputJsonValue,
      });
      const revRes = await callRole(
        keys,
        models.writer,
        reviserMessages(run, plan, draft, qaReport.requiredFixes ?? []),
        maxTokens
      );
      usages.push(revRes.usage);
      draft = revRes.text.trim();
    }

    const totals = usageTotals(usages);
    const { content, spec: specOut, caption } = splitDeliverable(draft);
    const cleanContent =
      spec.format === "article" && content ? stripImageMarkers(content) : content;
    // Visual formats (spec present) have no standalone content deliverable;
    // leave draftText null rather than duplicating the combined raw text.
    const storedDraft = cleanContent ?? (specOut ? null : draft);
    // Course outlines: derive the structured, editable lesson plan so the run
    // page can render it immediately (best-effort — the raw text remains).
    let outlineSyllabus: Prisma.InputJsonValue | undefined;
    if (run.postType === "course-outline" && (content ?? draft)) {
      try {
        const sylRes = await callRole(
          keys,
          models.orchestrator,
          syllabusMessages({ ...run, draftText: content ?? draft } as typeof run),
          8000
        );
        usages.push(sylRes.usage);
        const parsed = parseJsonOutput<Syllabus>(sylRes.text);
        parsed.lessons = (parsed.lessons ?? []).slice(0, MAX_LESSONS);
        outlineSyllabus = parsed as unknown as Prisma.InputJsonValue;
      } catch {
        // non-fatal: the outline text still works; extraction retries at generate time
      }
    }

    await prisma.agentRun.updateMany({
      where: { id: runId, NOT: { status: "CANCELLED" } },
      data: {
        status: "READY",
        ...(outlineSyllabus !== undefined ? { outlineSyllabus } : {}),
        draftText: storedDraft,
        specText: specOut,
        captionText: caption,
        // Snapshot the first finished output for the learning pass.
        ...(run.firstOutput ? {} : { firstOutput: draft }),
        qaReport: qaReport as unknown as Prisma.InputJsonValue,
        revisionRounds: run.revisionRounds + rounds,
        tokensPrompt: { increment: totals.prompt },
        tokensCompletion: { increment: totals.completion },
        costUsd: { increment: totals.cost },
        error: Prisma.DbNull,
      },
    });
  } catch (err) {
    const totals = usageTotals(usages);
    if (err instanceof RunCancelled) {
      // User stopped the run — record spend, keep CANCELLED status.
      await prisma.agentRun
        .updateMany({
          where: { id: runId, status: "CANCELLED" },
          data: {
            tokensPrompt: { increment: totals.prompt },
            tokensCompletion: { increment: totals.completion },
            costUsd: { increment: totals.cost },
          },
        })
        .catch(() => {});
      return;
    }
    await prisma.agentRun
      .update({
        where: { id: runId },
        data: {
          status: "FAILED",
          error: {
            message: err instanceof Error ? err.message : String(err),
          } as Prisma.InputJsonValue,
          tokensPrompt: { increment: totals.prompt },
          tokensCompletion: { increment: totals.completion },
          costUsd: { increment: totals.cost },
        },
      })
      .catch(() => {});
  }
}

/**
 * Worker-poll safety net: pick up QUEUED runs the in-process trigger lost
 * (server restart, crash). Called from the worker tick.
 */
export async function processStaleAgentRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - 60_000);
  const stale = await prisma.agentRun.findMany({
    where: { status: "QUEUED", updatedAt: { lt: cutoff } },
    select: { id: true },
    take: 3,
  });
  for (const { id } of stale) await executeRun(id);
  return stale.length;
}


/**
 * Learning pass (auto-improvement loop): compare the first output with the
 * approved final version and store durable style rules. Best-effort — never
 * fails the approval.
 */
export async function learnFromRun(runId: string): Promise<number> {
  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
  if (!run?.firstOutput || !run.approvedAt) return 0;
  const finalOutput = joinDeliverable(run.draftText, run.specText, run.captionText);
  if (!finalOutput.trim()) return 0;
  // Nothing changed since generation and no feedback → nothing to learn.
  const feedbackNotes = ((run.feedback ?? []) as { note?: string }[])
    .map((f) => f.note ?? "")
    .filter(Boolean);
  if (finalOutput.trim() === run.firstOutput.trim() && feedbackNotes.length === 0) {
    return 0;
  }
  try {
    const config = await getConfig();
    const keys: ProviderKeys = {
      anthropic: await getDecryptedAnthropicKey(),
      openai: await getDecryptedOpenaiKey(),
    };
    const models = resolveAgentModels(
      (config as unknown as { agentModels?: unknown }).agentModels
    );
    const existing = await prisma.agentLesson.findMany({
      where: { channel: run.channel, isActive: true },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { lesson: true },
    });
    const res = await callRole(
      keys,
      models.orchestrator,
      learnerMessages({
        run,
        firstOutput: run.firstOutput,
        finalOutput,
        feedbackNotes,
        existingLessons: existing.map((l) => l.lesson),
      }),
      4000
    );
    const parsed = parseJsonOutput<{ lessons?: string[] }>(res.text);
    const lessons = (parsed.lessons ?? [])
      .filter((l) => typeof l === "string" && l.trim().length > 0)
      .slice(0, 3);
    for (const lesson of lessons) {
      await prisma.agentLesson.create({
        data: {
          channel: run.channel,
          format: run.format,
          lesson: lesson.trim().slice(0, 300),
          sourceRunId: run.id,
          createdById: run.createdById,
        },
      });
    }
    return lessons.length;
  } catch {
    return 0; // learning is best-effort
  }
}
