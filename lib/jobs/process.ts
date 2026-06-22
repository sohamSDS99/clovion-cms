/**
 * Scheduled-publish processing logic (FR-CONTENT-06, §6.2).
 *
 * The `scheduled_jobs` table is the SOURCE OF TRUTH. BullMQ is only a trigger
 * that wakes us up roughly every 30s; all durable state lives in Postgres so
 * the system is crash-safe and at-least-once.
 *
 * This module is deliberately kept "pure-ish": the time/retry decision helpers
 * (`shouldRetry`, `nextBackoffMs`, `filterDueJobs`) are pure functions with no
 * I/O so they can be unit-tested without Redis or a database.
 */

import type { ScheduledAction, ScheduledStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { transitionContent } from "@/lib/content/service";
import type { SessionUser } from "@/lib/auth/guard";
import { ValidationError } from "@/lib/api/http";

// ── Tunables ───────────────────────────────────────────────────────────────

/** Max processing attempts before a job is marked FAILED (FR-CONTENT-06). */
export const MAX_ATTEMPTS = 3;

/** How many due jobs to claim per poll tick. */
export const DUE_BATCH_SIZE = 50;

/**
 * Synthetic SYSTEM actor for worker-driven transitions. role=ADMIN so the
 * permission layer permits `unpublish` (manager-only); `auto_publish` is always
 * permitted at the permission layer regardless. status=ACTIVE so no auth gate
 * downstream rejects it. The id is a fixed sentinel UUID used only for audit
 * attribution (it is an FK-less actor column, see schema notes).
 */
export const SYSTEM_USER: SessionUser = {
  id: "00000000-0000-0000-0000-000000000000",
  email: null,
  name: "system:scheduler",
  role: "ADMIN",
  status: "ACTIVE",
  authorProfileId: null,
};

// ── Pure helpers (UNIT TESTED) ───────────────────────────────────────────────

/**
 * Minimal shape of a schedulable job needed for the pure due-filter. Keeping
 * this structural lets tests pass plain objects without a Prisma row.
 */
export interface DueCandidate {
  id: string;
  runAt: Date;
  status: ScheduledStatus;
}

/**
 * Pure: given a list of candidate jobs and the current time, return the jobs
 * that are due to run now — PENDING and whose `runAt` is at or before `now`.
 * Sorted oldest-first so the most overdue jobs are processed first.
 */
export function filterDueJobs<T extends DueCandidate>(jobs: T[], now: Date): T[] {
  const nowMs = now.getTime();
  return jobs
    .filter((j) => j.status === "PENDING" && j.runAt.getTime() <= nowMs)
    .sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
}

/**
 * Pure: should a job be retried after a failed attempt? `attempts` is the count
 * AFTER incrementing for the just-failed attempt. Retries while we are still
 * below the cap.
 */
export function shouldRetry(attempts: number, maxAttempts: number = MAX_ATTEMPTS): boolean {
  return attempts < maxAttempts;
}

/**
 * Pure: exponential backoff (in ms) before the next retry, given the number of
 * attempts so far. Capped to keep within reasonable bounds. With base 30s:
 * attempt 1 -> 30s, attempt 2 -> 60s, attempt 3 -> 120s, then capped.
 */
export function nextBackoffMs(attempts: number): number {
  const baseMs = 30_000;
  const maxMs = 15 * 60_000; // 15 min cap
  const safeAttempts = Math.max(1, attempts);
  const delay = baseMs * 2 ** (safeAttempts - 1);
  return Math.min(delay, maxMs);
}

/** Map a ScheduledAction to the workflow transition action the worker invokes. */
export function transitionFor(action: ScheduledAction): "auto_publish" | "unpublish" {
  return action === "PUBLISH" ? "auto_publish" : "unpublish";
}

// ── DB-backed operations ──────────────────────────────────────────────────────

/**
 * Find jobs that are due to run. Queries the DB (source of truth) for PENDING
 * jobs whose `runAt` has passed, oldest-first, limited to a batch.
 *
 * NOTE: we do NOT include jobs whose backoff window has not elapsed — a retried
 * job's `runAt` is bumped forward by `nextBackoffMs` so this same predicate
 * naturally enforces the backoff.
 */
export async function findDueJobs(now: Date = new Date(), take: number = DUE_BATCH_SIZE) {
  return prisma.scheduledJob.findMany({
    where: { status: "PENDING", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take,
  });
}

/**
 * Result of processing a single job, for logging/observability by the worker.
 */
export type ProcessOutcome =
  | { result: "done"; jobId: string }
  | { result: "retry"; jobId: string; attempts: number; nextRunAt: Date }
  | { result: "failed"; jobId: string; attempts: number; error: string }
  | { result: "skipped"; jobId: string; reason: string };

/**
 * Process one scheduled job. Idempotent + at-least-once safe:
 *
 *  1. Atomically claim the job (PENDING -> RUNNING via updateMany guard) so two
 *     concurrent workers can never run the same job twice.
 *  2. Drive the content transition (auto_publish / unpublish). The content
 *     service already treats re-publishing an already-PUBLISHED item as a no-op
 *     success, giving us idempotency.
 *  3. On success -> DONE. On failure -> increment attempts and either reschedule
 *     (PENDING with backed-off runAt) or mark FAILED after MAX_ATTEMPTS, then
 *     notify owner+editors (TODO email hook).
 *
 * NEVER throws — the worker loop must keep running.
 */
export async function processJob(jobId: string, now: Date = new Date()): Promise<ProcessOutcome> {
  // 1. Atomic claim: only succeeds if the row is still PENDING.
  let claimed;
  try {
    claimed = await prisma.scheduledJob.updateMany({
      where: { id: jobId, status: "PENDING" },
      data: { status: "RUNNING" as ScheduledStatus },
    });
  } catch (err) {
    // DB hiccup during claim — leave the job for the next tick.
    return { result: "skipped", jobId, reason: errMessage(err) };
  }
  if (claimed.count === 0) {
    // Lost the race (another worker claimed it) or no longer PENDING.
    return { result: "skipped", jobId, reason: "not-pending" };
  }

  const job = await prisma.scheduledJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return { result: "skipped", jobId, reason: "missing-after-claim" };
  }

  try {
    // 2. Drive the lifecycle transition. The content service enforces the state
    //    machine + publish gate and is idempotent for already-PUBLISHED items.
    await transitionContent(SYSTEM_USER, job.contentId, transitionFor(job.action));

    // 3a. Success -> DONE.
    await prisma.scheduledJob.update({
      where: { id: job.id },
      data: { status: "DONE" as ScheduledStatus },
    });
    return { result: "done", jobId };
  } catch (err) {
    const attempts = job.attempts + 1;
    const message = errMessage(err);

    if (shouldRetry(attempts)) {
      // 3b. Transient or gate-not-yet-satisfied failure -> reschedule with
      //     backoff. Bumping runAt forward defers re-pickup by findDueJobs.
      const nextRunAt = new Date(now.getTime() + nextBackoffMs(attempts));
      await safeUpdate(job.id, {
        status: "PENDING" as ScheduledStatus,
        attempts,
        runAt: nextRunAt,
      });
      return { result: "retry", jobId, attempts, nextRunAt };
    }

    // 3c. Exhausted retries -> FAILED. Content is left as-is (e.g. still
    //     SCHEDULED) so an editor can intervene.
    await safeUpdate(job.id, { status: "FAILED" as ScheduledStatus, attempts });

    // FR-CONTENT-06: notify the content owner + editors that the scheduled
    // action failed permanently.
    // TODO(email): wire to the notification/email service once available, e.g.
    //   await notifyScheduledJobFailed({ contentId: job.contentId, action: job.action, error: message });
    // Distinguish a publish-gate ValidationError (content not ready) from an
    // unexpected error for clearer operator messaging.
    const kind = err instanceof ValidationError ? "publish-gate" : "error";
    console.error(
      `[scheduled-publish] job ${job.id} (${job.action} content=${job.contentId}) FAILED after ${attempts} attempts [${kind}]: ${message}`
    );

    return { result: "failed", jobId, attempts, error: message };
  }
}

/** Update that swallows DB errors so the worker loop never crashes. */
async function safeUpdate(id: string, data: Record<string, unknown>): Promise<void> {
  try {
    await prisma.scheduledJob.update({ where: { id }, data: data as never });
  } catch (err) {
    console.error(`[scheduled-publish] failed to update job ${id}: ${errMessage(err)}`);
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Process all currently-due jobs. Returns the per-job outcomes. Used by the
 * worker on each repeatable tick and by `enqueueDue`-style direct invocations.
 * Never throws.
 */
export async function processDueJobs(now: Date = new Date()): Promise<ProcessOutcome[]> {
  let due;
  try {
    due = await findDueJobs(now);
  } catch (err) {
    console.error(`[scheduled-publish] findDueJobs failed: ${errMessage(err)}`);
    return [];
  }
  const outcomes: ProcessOutcome[] = [];
  for (const job of due) {
    outcomes.push(await processJob(job.id, now));
  }
  return outcomes;
}
