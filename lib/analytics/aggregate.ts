/**
 * PURE analytics reducers (FR-ANALYTICS). Dependency-free: only `import type`
 * from @prisma/client (erased at build) — no Prisma client, no next-auth, no
 * Date math beyond UTC day keys. This keeps the math unit-testable without a DB
 * (mirrors the lib/workflow + lib/auth/rbac "pure module" convention).
 *
 * The DB-backed entry points live in `./ai.ts` and delegate here.
 */
import type { AiJobStatus } from "@prisma/client";

// ── Minimal, DB-agnostic row shapes the pure reducers operate on ────────────

/** The fields of an AIGenerationJob the aggregation actually needs. */
export interface AiJobRow {
  status: AiJobStatus;
  tokensPrompt: number | null;
  tokensCompletion: number | null;
  /** Already converted from Decimal -> number (null when never billed). */
  costUsd: number | null;
  lowGrounding: boolean;
  contentId: string | null;
  createdAt: Date;
}

/** A job paired with the lifecycle status of its target content item. */
export interface AiJobWithContentStatus {
  contentId: string;
  /** ContentStatus of the joined item, or null if the item is gone. */
  contentStatus: string | null;
}

/** UTC `YYYY-MM-DD` key for day bucketing (stable, zone-independent). */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Round to 4 decimal places (cost precision), avoiding binary-float noise. */
export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

export interface AiUsageTotals {
  totalJobs: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  queued: number;
  streaming: number;
  tokensPrompt: number;
  tokensCompletion: number;
  totalTokens: number;
  totalCostUsd: number;
  /** Mean cost across ALL jobs in the window (0 when no jobs). */
  avgCostPerJob: number;
}

/** Roll up status counts, tokens and cost from a flat list of jobs. */
export function summarizeJobs(rows: AiJobRow[]): AiUsageTotals {
  let succeeded = 0;
  let failed = 0;
  let cancelled = 0;
  let queued = 0;
  let streaming = 0;
  let tokensPrompt = 0;
  let tokensCompletion = 0;
  let totalCostUsd = 0;

  for (const r of rows) {
    switch (r.status) {
      case "SUCCEEDED":
        succeeded++;
        break;
      case "FAILED":
        failed++;
        break;
      case "CANCELLED":
        cancelled++;
        break;
      case "QUEUED":
        queued++;
        break;
      case "STREAMING":
        streaming++;
        break;
    }
    tokensPrompt += r.tokensPrompt ?? 0;
    tokensCompletion += r.tokensCompletion ?? 0;
    totalCostUsd += r.costUsd ?? 0;
  }

  const totalJobs = rows.length;
  totalCostUsd = round4(totalCostUsd);

  return {
    totalJobs,
    succeeded,
    failed,
    cancelled,
    queued,
    streaming,
    tokensPrompt,
    tokensCompletion,
    totalTokens: tokensPrompt + tokensCompletion,
    totalCostUsd,
    avgCostPerJob: totalJobs > 0 ? round4(totalCostUsd / totalJobs) : 0,
  };
}

/** One day in the cost timeseries. */
export interface CostBucket {
  /** UTC day, `YYYY-MM-DD`. */
  date: string;
  jobs: number;
  costUsd: number;
}

/**
 * Group jobs into per-UTC-day cost + count buckets, sorted ascending by date.
 * Only "day" granularity is supported (the PRD dashboard is daily).
 */
export function bucketCostByDay(rows: AiJobRow[]): CostBucket[] {
  const byDay = new Map<string, { jobs: number; costUsd: number }>();
  for (const r of rows) {
    const key = dayKey(r.createdAt);
    const cur = byDay.get(key) ?? { jobs: 0, costUsd: 0 };
    cur.jobs += 1;
    cur.costUsd += r.costUsd ?? 0;
    byDay.set(key, cur);
  }
  return [...byDay.entries()]
    .map(([date, v]) => ({ date, jobs: v.jobs, costUsd: round4(v.costUsd) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface GroundingStats {
  /** SUCCEEDED jobs in scope (the denominator). */
  succeededJobs: number;
  /** SUCCEEDED jobs flagged lowGrounding ("verify facts"). */
  lowGroundingJobs: number;
  /** lowGroundingJobs / succeededJobs as a 0–100 percentage (0 when none). */
  lowGroundingRate: number;
}

/**
 * The "verify facts" rate: share of SUCCEEDED jobs flagged `lowGrounding`.
 * Non-succeeded jobs are excluded from both numerator and denominator — a
 * failed/cancelled job never produced a draft to ground.
 */
export function groundingFromJobs(rows: AiJobRow[]): GroundingStats {
  let succeededJobs = 0;
  let lowGroundingJobs = 0;
  for (const r of rows) {
    if (r.status !== "SUCCEEDED") continue;
    succeededJobs++;
    if (r.lowGrounding) lowGroundingJobs++;
  }
  return {
    succeededJobs,
    lowGroundingJobs,
    lowGroundingRate:
      succeededJobs > 0 ? round4((lowGroundingJobs / succeededJobs) * 100) : 0,
  };
}

export interface AcceptanceStats {
  /** Distinct content items that have at least one AI job (the denominator). */
  draftedItems: number;
  /** Of those, how many are now PUBLISHED (the PRD acceptance signal). */
  publishedItems: number;
  /** Still DRAFT / IN_REVIEW / SCHEDULED — pending acceptance. */
  pendingItems: number;
  /** UNPUBLISHED / ARCHIVED / missing — effectively discarded. */
  discardedItems: number;
  /** publishedItems / draftedItems as 0–100 (PRD target ≥60%). */
  acceptanceRate: number;
}

/**
 * AI-draft acceptance proxy (PRD success metric: "≥60% of AI drafts published").
 * Input is one entry per AI job that has a contentId, carrying the CURRENT
 * lifecycle status of that item. We dedupe by contentId (a single item may have
 * spawned several jobs) and classify each distinct item once.
 */
export function acceptanceFromItems(rows: AiJobWithContentStatus[]): AcceptanceStats {
  // Dedupe to distinct items; an item's status is the same across its jobs.
  const byItem = new Map<string, string | null>();
  for (const r of rows) {
    if (!byItem.has(r.contentId)) byItem.set(r.contentId, r.contentStatus);
  }

  let publishedItems = 0;
  let pendingItems = 0;
  let discardedItems = 0;

  for (const status of byItem.values()) {
    switch (status) {
      case "PUBLISHED":
        publishedItems++;
        break;
      case "DRAFT":
      case "IN_REVIEW":
      case "SCHEDULED":
        pendingItems++;
        break;
      // UNPUBLISHED, ARCHIVED, or null (item deleted) -> discarded.
      default:
        discardedItems++;
        break;
    }
  }

  const draftedItems = byItem.size;
  return {
    draftedItems,
    publishedItems,
    pendingItems,
    discardedItems,
    acceptanceRate:
      draftedItems > 0 ? round4((publishedItems / draftedItems) * 100) : 0,
  };
}
