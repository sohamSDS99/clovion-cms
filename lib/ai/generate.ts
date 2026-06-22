/**
 * AI generation orchestrator (§6.1). The SOLE generation entry point.
 *
 * Drives the deterministic pipeline:
 *   budget gate -> config/key gate -> KB retrieval -> active SOP -> prompt
 *   assembly -> create AIGenerationJob (QUEUED->STREAMING) -> stream from
 *   OpenRouter (yielding tokens) -> coerce to Tiptap -> persist output + usage +
 *   lowGrounding -> SUCCEEDED. On a provider error the job is marked FAILED with
 *   the error retained (and any partial text preserved).
 *
 * CRITICAL invariants:
 *   - DRAFT ONLY: this never touches ContentItem.status or publishes anything.
 *   - Accurate cost/token capture: usage + costUsd come from the provider's
 *     streamed usage object and are persisted on the job.
 *   - Deterministic prompt order is delegated to `assemblePrompt` (pure).
 *
 * Exposed as an async generator so the route can wrap it for SSE while a
 * non-streaming caller (e.g. the GET poll fallback consumer) can `for await`.
 */

import { Prisma, type AiMode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/auth/guard";
import { getConfig, getDecryptedKey, budgetStatus } from "@/lib/ai/config";
import {
  createOpenRouterClient,
  OpenRouterError,
  type ChatCompletionResult,
  type Usage,
} from "@/lib/ai/openrouter";
import { getActiveSopForType } from "@/lib/sop/service";
import { retrieveChunks } from "@/lib/kb/retrieve";
import {
  assemblePrompt,
  type AiGenerationMode,
  type PromptChunk,
} from "@/lib/ai/prompt";
import { htmlToTiptap, type TiptapDoc } from "@/lib/ai/coerce";
import type { GenerateRequestInput } from "@/lib/ai/schemas";

/** A typed generation failure carrying a stable SSE `code`. */
export class GenerationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GenerationError";
    this.code = code;
  }
}

const MODE_TO_ENUM: Record<AiGenerationMode, AiMode> = {
  full_draft: "FULL_DRAFT",
  section: "SECTION",
  rewrite: "REWRITE",
  outline: "OUTLINE",
};

/** Events yielded by `runGeneration` — mirror the SSE contract message shapes. */
export type GenerationEvent =
  | { type: "token"; text: string }
  | {
      type: "done";
      jobId: string;
      tiptap: TiptapDoc;
      html: string;
      lowGrounding: boolean;
      usage: {
        promptTokens: number;
        completionTokens: number;
        costUsd: number;
      };
      sources: Array<{ title: string }>;
    }
  | { type: "error"; message: string; code: string };

export interface RunGenerationArgs {
  user: SessionUser;
  req: GenerateRequestInput;
  /** Optional abort signal so the route can cancel upstream on client disconnect. */
  signal?: AbortSignal;
}

/** Top-K KB chunks to retrieve for grounding. */
const RETRIEVAL_K = 8;

/**
 * Build the retrieval query from the brief (topic + keywords + section/selection
 * + the content title when editing an existing item).
 */
function buildRetrievalQuery(
  req: GenerateRequestInput,
  contentTitle?: string | null
): string {
  const parts: string[] = [];
  if (contentTitle) parts.push(contentTitle);
  if (req.brief.topic) parts.push(req.brief.topic);
  if (req.brief.sectionName) parts.push(req.brief.sectionName);
  if (req.brief.selectedText) parts.push(req.brief.selectedText);
  if (req.brief.keywords?.length) parts.push(req.brief.keywords.join(" "));
  return parts.join(" ").trim();
}

/** Parse OpenAI/OpenRouter SSE lines, yielding content deltas + capturing usage. */
async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  onUsage: (usage: Usage) => void,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line; each may have multiple lines.
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        for (const line of rawEvent.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;

          let json: {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: Usage;
          };
          try {
            json = JSON.parse(data);
          } catch {
            continue; // ignore malformed keep-alive / partial frames
          }

          if (json.usage) onUsage(json.usage);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * OpenRouter usage accounting (FR cost capture): when the request is sent with
 * `usage: { include: true }` (+ `stream_options.include_usage` for streams),
 * the provider's final usage frame carries a `cost` field in USD. We read it
 * straight off the typed `Usage.cost`. If the provider omits it we leave cost at
 * 0 (the editor still gets accurate prompt/completion token counts) — we never
 * guess a price. Ref: https://openrouter.ai/docs/use-cases/usage-accounting
 */
function extractCostUsd(usage: Usage | null): number {
  if (!usage) return 0;
  const cost = usage.cost;
  return typeof cost === "number" && Number.isFinite(cost) ? cost : 0;
}

/**
 * Run a generation. Yields `token` events as the model streams, then a single
 * terminal `done` (success) or `error` event. Persists the AIGenerationJob
 * throughout. NEVER mutates content status.
 */
export async function* runGeneration(
  args: RunGenerationArgs
): AsyncGenerator<GenerationEvent> {
  const { user, req, signal } = args;

  // 1) Budget gate (FR-SETTINGS-04). Admin may override an exceeded budget.
  const budget = await budgetStatus();
  if (budget.exceeded && !(req.budgetOverride && user.role === "ADMIN")) {
    yield {
      type: "error",
      code: "budget_exceeded",
      message: `Monthly AI budget exceeded ($${budget.spentUsd.toFixed(
        2
      )} of $${budget.budgetUsd?.toFixed(2) ?? "0.00"}).`,
    };
    return;
  }

  // 2) Config + key gate. No key => not configured.
  const config = await getConfig();
  const apiKey = await getDecryptedKey();
  if (!apiKey || !config.defaultModel) {
    yield {
      type: "error",
      code: "ai_not_configured",
      message:
        "AI provider is not configured. Set an OpenRouter API key and a default model in Settings.",
    };
    return;
  }

  // 3) Resolve content title (for retrieval) when editing an existing item.
  let contentTitle: string | null = null;
  if (req.contentId) {
    const item = await prisma.contentItem.findFirst({
      where: { id: req.contentId, deletedAt: null },
      select: { title: true },
    });
    contentTitle = item?.title ?? null;
  }

  // 4) KB retrieval (grounding) + active SOP for this type.
  const query = buildRetrievalQuery(req, contentTitle);
  const [retrieval, sop] = await Promise.all([
    query
      ? retrieveChunks(query, { tags: req.kbTags, k: RETRIEVAL_K })
      : Promise.resolve({ chunks: [], lowGrounding: true }),
    getActiveSopForType(req.contentType),
  ]);

  // Attach source titles for attribution in the KNOWLEDGE block + done event.
  const kbItemIds = [...new Set(retrieval.chunks.map((c) => c.kbItemId))];
  const titleById = new Map<string, string>();
  if (kbItemIds.length > 0) {
    const items = await prisma.knowledgeBaseItem.findMany({
      where: { id: { in: kbItemIds } },
      select: { id: true, title: true },
    });
    for (const it of items) titleById.set(it.id, it.title);
  }
  const promptChunks: PromptChunk[] = retrieval.chunks.map((c) => ({
    chunkText: c.chunkText,
    score: c.score,
    kbItemId: c.kbItemId,
    sourceTitle: titleById.get(c.kbItemId),
  }));

  // 5) Deterministic prompt assembly (pure).
  const assembled = assemblePrompt({
    mode: req.mode,
    contentType: req.contentType,
    brief: req.brief,
    sop: sop ? { id: sop.id, version: sop.version, body: sop.body } : null,
    chunks: promptChunks,
  });

  // 6) Create the job (QUEUED) recording the prompt assembly provenance.
  const job = await prisma.aIGenerationJob.create({
    data: {
      contentId: req.contentId ?? null,
      requestedById: user.id,
      mode: MODE_TO_ENUM[req.mode],
      model: config.defaultModel,
      status: "QUEUED",
      lowGrounding: retrieval.lowGrounding,
      promptAssembly: {
        sopId: sop?.id ?? null,
        sopVersion: sop?.version ?? null,
        chunkIds: assembled.meta.chunkIdsUsed,
        chunksDropped: assembled.meta.chunksDropped,
        briefTruncated: assembled.meta.briefTruncated,
        mode: req.mode,
        contentType: req.contentType,
      } as Prisma.InputJsonValue,
    },
  });

  const sources = kbItemIds
    .map((id) => ({ title: titleById.get(id) ?? "" }))
    .filter((s) => s.title);

  let accumulated = "";
  const usageHolder: { value: Usage | null } = { value: null };

  try {
    await prisma.aIGenerationJob.update({
      where: { id: job.id },
      data: { status: "STREAMING" },
    });

    const client = createOpenRouterClient(apiKey);
    const response = await client.chatCompletion({
      model: config.defaultModel,
      messages: assembled.messages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      stream: true,
    });

    if (!response.body) {
      throw new OpenRouterError(502, "No response body from provider.");
    }

    for await (const delta of parseSseStream(
      response.body,
      (u) => {
        usageHolder.value = u;
      },
      signal
    )) {
      accumulated += delta;
      yield { type: "token", text: delta };
      if (signal?.aborted) break;
    }

    // Client aborted mid-stream: mark cancelled, retain partial, no done event.
    if (signal?.aborted) {
      await prisma.aIGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "CANCELLED",
          outputTiptap: htmlToTiptap(accumulated)
            .doc as unknown as Prisma.InputJsonValue,
        },
      });
      return;
    }

    // 7) Coerce model HTML -> sanitized Tiptap doc (+ needsReview fallback).
    const coerced = htmlToTiptap(accumulated);
    const html = accumulated;

    const usage = usageHolder.value;
    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    const costUsd = extractCostUsd(usage);

    await prisma.aIGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        outputTiptap: coerced.doc as unknown as Prisma.InputJsonValue,
        tokensPrompt: promptTokens,
        tokensCompletion: completionTokens,
        costUsd: new Prisma.Decimal(costUsd),
        // lowGrounding already set; OR-in a coerce fallback as a review signal.
        lowGrounding: retrieval.lowGrounding || coerced.needsReview,
      },
    });

    yield {
      type: "done",
      jobId: job.id,
      tiptap: coerced.doc,
      html,
      lowGrounding: retrieval.lowGrounding || coerced.needsReview,
      usage: { promptTokens, completionTokens, costUsd },
      sources,
    };
  } catch (err) {
    const isProvider = err instanceof OpenRouterError;
    const code = isProvider ? "provider_error" : "internal_error";
    const message =
      err instanceof Error ? err.message : "Generation failed unexpectedly.";

    await prisma.aIGenerationJob
      .update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: {
            code,
            message,
            status: isProvider ? (err as OpenRouterError).status : undefined,
            partialChars: accumulated.length,
          } as Prisma.InputJsonValue,
          // Retain any partial output so the editor can still salvage it.
          outputTiptap: accumulated
            ? (htmlToTiptap(accumulated)
                .doc as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      })
      .catch(() => {
        /* never mask the original error with a persistence failure */
      });

    yield { type: "error", code, message };
  }
}

/** Re-export for the non-streaming GET poll mapper. */
export type { ChatCompletionResult };
