/**
 * Pure unit tests for the scheduled-publish decision logic (FR-CONTENT-06).
 * No Redis / DB — only the pure helpers: filterDueJobs, shouldRetry,
 * nextBackoffMs, transitionFor.
 */

import { describe, it, expect } from "vitest";
import {
  filterDueJobs,
  shouldRetry,
  nextBackoffMs,
  transitionFor,
  MAX_ATTEMPTS,
  type DueCandidate,
} from "../process";

describe("filterDueJobs", () => {
  const now = new Date("2026-06-22T12:00:00.000Z");
  const mk = (id: string, runAt: string, status: DueCandidate["status"]): DueCandidate => ({
    id,
    runAt: new Date(runAt),
    status,
  });

  it("returns PENDING jobs whose runAt is at or before now", () => {
    const jobs = [
      mk("past", "2026-06-22T11:59:00.000Z", "PENDING"),
      mk("exact", "2026-06-22T12:00:00.000Z", "PENDING"),
      mk("future", "2026-06-22T12:01:00.000Z", "PENDING"),
    ];
    const due = filterDueJobs(jobs, now);
    expect(due.map((j) => j.id)).toEqual(["past", "exact"]);
  });

  it("excludes jobs that are not PENDING even if overdue", () => {
    const jobs = [
      mk("running", "2026-06-22T11:00:00.000Z", "RUNNING"),
      mk("done", "2026-06-22T11:00:00.000Z", "DONE"),
      mk("failed", "2026-06-22T11:00:00.000Z", "FAILED"),
      mk("cancelled", "2026-06-22T11:00:00.000Z", "CANCELLED"),
      mk("pending", "2026-06-22T11:00:00.000Z", "PENDING"),
    ];
    expect(filterDueJobs(jobs, now).map((j) => j.id)).toEqual(["pending"]);
  });

  it("sorts due jobs oldest-first (most overdue runs first)", () => {
    const jobs = [
      mk("newer", "2026-06-22T11:59:00.000Z", "PENDING"),
      mk("oldest", "2026-06-22T10:00:00.000Z", "PENDING"),
      mk("middle", "2026-06-22T11:30:00.000Z", "PENDING"),
    ];
    expect(filterDueJobs(jobs, now).map((j) => j.id)).toEqual(["oldest", "middle", "newer"]);
  });

  it("returns empty for no due jobs", () => {
    const jobs = [mk("future", "2026-06-22T13:00:00.000Z", "PENDING")];
    expect(filterDueJobs(jobs, now)).toEqual([]);
  });
});

describe("shouldRetry", () => {
  it("retries while below the max", () => {
    expect(shouldRetry(1, 3)).toBe(true);
    expect(shouldRetry(2, 3)).toBe(true);
  });

  it("stops at the max", () => {
    expect(shouldRetry(3, 3)).toBe(false);
    expect(shouldRetry(4, 3)).toBe(false);
  });

  it("defaults to MAX_ATTEMPTS", () => {
    expect(shouldRetry(MAX_ATTEMPTS - 1)).toBe(true);
    expect(shouldRetry(MAX_ATTEMPTS)).toBe(false);
  });
});

describe("nextBackoffMs", () => {
  it("grows exponentially from a 30s base", () => {
    expect(nextBackoffMs(1)).toBe(30_000);
    expect(nextBackoffMs(2)).toBe(60_000);
    expect(nextBackoffMs(3)).toBe(120_000);
  });

  it("is monotonically non-decreasing", () => {
    for (let a = 1; a < 10; a++) {
      expect(nextBackoffMs(a + 1)).toBeGreaterThanOrEqual(nextBackoffMs(a));
    }
  });

  it("caps at 15 minutes", () => {
    expect(nextBackoffMs(100)).toBe(15 * 60_000);
  });

  it("treats non-positive attempts as the first attempt", () => {
    expect(nextBackoffMs(0)).toBe(30_000);
    expect(nextBackoffMs(-5)).toBe(30_000);
  });
});

describe("transitionFor", () => {
  it("maps PUBLISH to auto_publish and UNPUBLISH to unpublish", () => {
    expect(transitionFor("PUBLISH")).toBe("auto_publish");
    expect(transitionFor("UNPUBLISH")).toBe("unpublish");
  });
});
