/**
 * AI budget / usage / grounding analytics — DB-backed entry points (FR-ANALYTICS).
 *
 * The math lives in the dependency-free `./aggregate` module (so it is unit-
 * testable without Prisma/next-auth). This file only:
 *   - queries Prisma,
 *   - normalizes Decimal -> Number at the boundary (`costUsd` is Decimal(10,4)),
 *   - delegates to the pure reducers,
 *   - shapes the JSON the API emits.
 *
 * Pure reducers are re-exported here so existing importers of `@/lib/analytics/ai`
 * keep working.
 */
import { prisma } from "@/lib/db/prisma";
import { budgetStatus, type BudgetStatus } from "@/lib/ai/config";
import type { AiJobStatus, AiMode } from "@prisma/client";
import {
  summarizeJobs,
  bucketCostByDay,
  groundingFromJobs,
  acceptanceFromItems,
  type AiJobRow,
  type AiJobWithContentStatus,
  type AiUsageTotals,
  type CostBucket,
  type GroundingStats,
  type AcceptanceStats,
} from "./aggregate";

// Re-export the pure layer for convenience / backward-compatible imports.
export {
  summarizeJobs,
  bucketCostByDay,
  groundingFromJobs,
  acceptanceFromItems,
} from "./aggregate";
export type {
  AiJobRow,
  AiJobWithContentStatus,
  AiUsageTotals,
  CostBucket,
  GroundingStats,
  AcceptanceStats,
} from "./aggregate";

// ── Date-window helper ──────────────────────────────────────────────────────

export interface DateWindow {
  from?: Date;
  to?: Date;
}

/** Build a Prisma `createdAt` filter from an optional window. */
function createdAtFilter(window: DateWindow): { gte?: Date; lte?: Date } | undefined {
  if (!window.from && !window.to) return undefined;
  return {
    ...(window.from ? { gte: window.from } : {}),
    ...(window.to ? { lte: window.to } : {}),
  };
}

// ── DB-backed entry points ───────────────────────────────────────────────────

/** Columns of AIGenerationJob we select for analytics (keeps payloads small). */
const JOB_SELECT = {
  status: true,
  tokensPrompt: true,
  tokensCompletion: true,
  costUsd: true,
  lowGrounding: true,
  contentId: true,
  createdAt: true,
} as const;

/** Load jobs in a window and normalize Decimal -> number for the reducers. */
async function loadJobs(window: DateWindow): Promise<AiJobRow[]> {
  const createdAt = createdAtFilter(window);
  const rows = await prisma.aIGenerationJob.findMany({
    where: createdAt ? { createdAt } : {},
    select: JOB_SELECT,
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    status: r.status,
    tokensPrompt: r.tokensPrompt,
    tokensCompletion: r.tokensCompletion,
    costUsd: r.costUsd != null ? Number(r.costUsd) : null,
    lowGrounding: r.lowGrounding,
    contentId: r.contentId,
    createdAt: r.createdAt,
  }));
}

export interface AiUsageSummary extends AiUsageTotals {
  /** Current calendar-month spend vs configured budget (from lib/ai/config). */
  budget: BudgetStatus;
}

/**
 * `getAiUsageSummary` — totals + status breakdown + tokens + cost for the
 * window, plus the live current-month budget status.
 */
export async function getAiUsageSummary(
  window: DateWindow = {}
): Promise<AiUsageSummary> {
  const [rows, budget] = await Promise.all([loadJobs(window), budgetStatus()]);
  return { ...summarizeJobs(rows), budget };
}

/**
 * `getCostOverTime` — per-UTC-day cost + job count. Grouping is done in JS
 * (no SQL date_trunc) so it stays portable and reuses the pure reducer.
 */
export async function getCostOverTime(
  window: DateWindow & { bucket?: "day" } = {}
): Promise<CostBucket[]> {
  const rows = await loadJobs(window);
  return bucketCostByDay(rows);
}

/** `getGroundingStats` — lowGrounding ("verify facts") rate over SUCCEEDED. */
export async function getGroundingStats(
  window: DateWindow = {}
): Promise<GroundingStats> {
  const rows = await loadJobs(window);
  return groundingFromJobs(rows);
}

/**
 * `getAcceptanceProxy` — AI-draft acceptance proxy. Joins jobs that carry a
 * contentId to their ContentItem.status, then classifies distinct items as
 * published / pending / discarded.
 */
export async function getAcceptanceProxy(
  window: DateWindow = {}
): Promise<AcceptanceStats> {
  const createdAt = createdAtFilter(window);
  const rows = await prisma.aIGenerationJob.findMany({
    where: {
      ...(createdAt ? { createdAt } : {}),
      contentId: { not: null },
    },
    select: {
      contentId: true,
      content: { select: { status: true } },
    },
  });
  const items: AiJobWithContentStatus[] = rows.map((r) => ({
    contentId: r.contentId as string,
    contentStatus: r.content?.status ?? null,
  }));
  return acceptanceFromItems(items);
}

/** A row in the dashboard's "recent jobs" feed (JSON-safe). */
export interface RecentJob {
  id: string;
  mode: AiMode;
  status: AiJobStatus;
  model: string | null;
  costUsd: number | null;
  totalTokens: number | null;
  lowGrounding: boolean;
  contentId: string | null;
  /** Joined content title/status when the job targeted an item. */
  contentTitle: string | null;
  contentStatus: string | null;
  createdAt: string;
}

/**
 * `getRecentJobs` — newest-first feed for the dashboard table. Decimal cost is
 * normalized to a number and timestamps to ISO strings so the payload is
 * trivially JSON-serializable.
 */
export async function getRecentJobs(
  window: DateWindow = {},
  limit = 12
): Promise<RecentJob[]> {
  const createdAt = createdAtFilter(window);
  const rows = await prisma.aIGenerationJob.findMany({
    where: createdAt ? { createdAt } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      mode: true,
      status: true,
      model: true,
      costUsd: true,
      tokensPrompt: true,
      tokensCompletion: true,
      lowGrounding: true,
      contentId: true,
      createdAt: true,
      content: { select: { title: true, status: true } },
    },
  });
  return rows.map((r) => {
    const tp = r.tokensPrompt;
    const tc = r.tokensCompletion;
    const totalTokens = tp == null && tc == null ? null : (tp ?? 0) + (tc ?? 0);
    return {
      id: r.id,
      mode: r.mode,
      status: r.status,
      model: r.model,
      costUsd: r.costUsd != null ? Number(r.costUsd) : null,
      totalTokens,
      lowGrounding: r.lowGrounding,
      contentId: r.contentId,
      contentTitle: r.content?.title ?? null,
      contentStatus: r.content?.status ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

/** The full dashboard payload returned by GET /api/analytics/ai. */
export interface AiAnalyticsPayload {
  window: { from: string | null; to: string | null };
  summary: AiUsageSummary;
  costOverTime: CostBucket[];
  grounding: GroundingStats;
  acceptance: AcceptanceStats;
  recentJobs: RecentJob[];
}

/**
 * Convenience aggregate used by the route: runs every analytic for one window
 * and shapes the JSON response. `loadJobs` is called per-analytic but each is a
 * cheap select; the dashboard is admin-only and not hot-path.
 */
export async function getAiAnalytics(
  window: DateWindow = {}
): Promise<AiAnalyticsPayload> {
  const [summary, costOverTime, grounding, acceptance, recentJobs] =
    await Promise.all([
      getAiUsageSummary(window),
      getCostOverTime(window),
      getGroundingStats(window),
      getAcceptanceProxy(window),
      getRecentJobs(window),
    ]);
  return {
    window: {
      from: window.from ? window.from.toISOString() : null,
      to: window.to ? window.to.toISOString() : null,
    },
    summary,
    costOverTime,
    grounding,
    acceptance,
    recentJobs,
  };
}
