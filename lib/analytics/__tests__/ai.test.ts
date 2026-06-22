/**
 * Unit tests for the PURE analytics reducers (FR-ANALYTICS). No DB / Prisma:
 * we feed fake job arrays into the reducers and assert the math. The DB-backed
 * entry points (`getAiUsageSummary`, etc. in ./ai) are thin wrappers over these.
 *
 * We import from `./aggregate` (the dependency-free pure module) so the test
 * never drags in Prisma / next-auth.
 */
import { describe, it, expect } from "vitest";
import {
  summarizeJobs,
  bucketCostByDay,
  groundingFromJobs,
  acceptanceFromItems,
  type AiJobRow,
  type AiJobWithContentStatus,
} from "@/lib/analytics/aggregate";

/** Build a job row with sane defaults; override only what a test cares about. */
function job(overrides: Partial<AiJobRow> = {}): AiJobRow {
  return {
    status: "SUCCEEDED",
    tokensPrompt: 100,
    tokensCompletion: 50,
    costUsd: 0.01,
    lowGrounding: false,
    contentId: null,
    createdAt: new Date("2026-06-01T12:00:00Z"),
    ...overrides,
  };
}

describe("summarizeJobs", () => {
  it("rolls up status counts, tokens and cost", () => {
    const rows: AiJobRow[] = [
      job({ status: "SUCCEEDED", costUsd: 0.02, tokensPrompt: 200, tokensCompletion: 100 }),
      job({ status: "FAILED", costUsd: 0.005, tokensPrompt: 10, tokensCompletion: 0 }),
      job({ status: "CANCELLED", costUsd: null, tokensPrompt: null, tokensCompletion: null }),
      job({ status: "QUEUED", costUsd: null, tokensPrompt: null, tokensCompletion: null }),
      job({ status: "STREAMING", costUsd: 0.001, tokensPrompt: 5, tokensCompletion: 5 }),
    ];
    const s = summarizeJobs(rows);

    expect(s.totalJobs).toBe(5);
    expect(s.succeeded).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.queued).toBe(1);
    expect(s.streaming).toBe(1);

    expect(s.tokensPrompt).toBe(215);
    expect(s.tokensCompletion).toBe(105);
    expect(s.totalTokens).toBe(320);

    // 0.02 + 0.005 + 0.001 = 0.026
    expect(s.totalCostUsd).toBeCloseTo(0.026, 4);
    expect(s.avgCostPerJob).toBeCloseTo(0.026 / 5, 4);
  });

  it("treats null tokens/cost as zero and avoids float drift", () => {
    const rows = [job({ costUsd: 0.1 }), job({ costUsd: 0.2 })];
    const s = summarizeJobs(rows);
    expect(s.totalCostUsd).toBe(0.3); // not 0.30000000000000004
  });

  it("returns zeroed totals for an empty array", () => {
    const s = summarizeJobs([]);
    expect(s.totalJobs).toBe(0);
    expect(s.totalCostUsd).toBe(0);
    expect(s.avgCostPerJob).toBe(0);
    expect(s.totalTokens).toBe(0);
  });
});

describe("bucketCostByDay", () => {
  it("groups by UTC day, sums cost + count, and sorts ascending", () => {
    const rows: AiJobRow[] = [
      job({ createdAt: new Date("2026-06-02T01:00:00Z"), costUsd: 0.05 }),
      job({ createdAt: new Date("2026-06-01T23:00:00Z"), costUsd: 0.01 }),
      job({ createdAt: new Date("2026-06-01T08:00:00Z"), costUsd: 0.02 }),
      job({ createdAt: new Date("2026-06-02T22:30:00Z"), costUsd: null }),
    ];
    const buckets = bucketCostByDay(rows);

    expect(buckets.map((b) => b.date)).toEqual(["2026-06-01", "2026-06-02"]);

    const d1 = buckets[0];
    expect(d1.jobs).toBe(2);
    expect(d1.costUsd).toBeCloseTo(0.03, 4);

    const d2 = buckets[1];
    expect(d2.jobs).toBe(2);
    expect(d2.costUsd).toBeCloseTo(0.05, 4); // null cost contributes 0
  });

  it("returns an empty array for no rows", () => {
    expect(bucketCostByDay([])).toEqual([]);
  });
});

describe("groundingFromJobs", () => {
  it("computes lowGrounding rate over SUCCEEDED jobs only", () => {
    const rows: AiJobRow[] = [
      job({ status: "SUCCEEDED", lowGrounding: true }),
      job({ status: "SUCCEEDED", lowGrounding: false }),
      job({ status: "SUCCEEDED", lowGrounding: false }),
      job({ status: "SUCCEEDED", lowGrounding: true }),
      // These must be excluded from the denominator entirely:
      job({ status: "FAILED", lowGrounding: true }),
      job({ status: "QUEUED", lowGrounding: true }),
    ];
    const g = groundingFromJobs(rows);
    expect(g.succeededJobs).toBe(4);
    expect(g.lowGroundingJobs).toBe(2);
    expect(g.lowGroundingRate).toBe(50);
  });

  it("returns 0% when there are no succeeded jobs", () => {
    const g = groundingFromJobs([job({ status: "FAILED", lowGrounding: true })]);
    expect(g.succeededJobs).toBe(0);
    expect(g.lowGroundingJobs).toBe(0);
    expect(g.lowGroundingRate).toBe(0);
  });
});

describe("acceptanceFromItems", () => {
  it("dedupes by contentId and classifies distinct items", () => {
    const rows: AiJobWithContentStatus[] = [
      // item A — two jobs, published -> counts once as published
      { contentId: "a", contentStatus: "PUBLISHED" },
      { contentId: "a", contentStatus: "PUBLISHED" },
      // item B — pending (in review)
      { contentId: "b", contentStatus: "IN_REVIEW" },
      // item C — draft (pending)
      { contentId: "c", contentStatus: "DRAFT" },
      // item D — archived (discarded)
      { contentId: "d", contentStatus: "ARCHIVED" },
      // item E — content deleted / null (discarded)
      { contentId: "e", contentStatus: null },
    ];
    const a = acceptanceFromItems(rows);

    expect(a.draftedItems).toBe(5);
    expect(a.publishedItems).toBe(1);
    expect(a.pendingItems).toBe(2);
    expect(a.discardedItems).toBe(2);
    expect(a.acceptanceRate).toBe(20); // 1 / 5
  });

  it("hits the PRD 60% target", () => {
    const rows: AiJobWithContentStatus[] = [
      { contentId: "1", contentStatus: "PUBLISHED" },
      { contentId: "2", contentStatus: "PUBLISHED" },
      { contentId: "3", contentStatus: "PUBLISHED" },
      { contentId: "4", contentStatus: "DRAFT" },
      { contentId: "5", contentStatus: "ARCHIVED" },
    ];
    const a = acceptanceFromItems(rows);
    expect(a.acceptanceRate).toBe(60);
    expect(a.publishedItems).toBe(3);
  });

  it("returns 0% acceptance for no drafted items", () => {
    const a = acceptanceFromItems([]);
    expect(a.draftedItems).toBe(0);
    expect(a.acceptanceRate).toBe(0);
  });

  it("treats SCHEDULED as pending, UNPUBLISHED as discarded", () => {
    const a = acceptanceFromItems([
      { contentId: "x", contentStatus: "SCHEDULED" },
      { contentId: "y", contentStatus: "UNPUBLISHED" },
    ]);
    expect(a.pendingItems).toBe(1);
    expect(a.discardedItems).toBe(1);
    expect(a.publishedItems).toBe(0);
  });
});
