/**
 * BullMQ queue + repeatable-job registration for scheduled publishing
 * (FR-CONTENT-06, §6.2).
 *
 * Strategy: BullMQ is only a TRIGGER. A single repeatable job fires every ~30s
 * and the worker reacts by scanning the DB (source of truth) for due jobs. A
 * 30s tick comfortably meets the ±60s precision target. We additionally support
 * direct delayed enqueues (`enqueuePublish`) for low-latency near-term runs, but
 * those are optional optimizations — correctness never depends on them because
 * the poller will catch every due job regardless.
 */

import { Queue, type JobsOptions } from "bullmq";
import { getConnection } from "./connection";

/** Stable queue name shared by producer (app) and consumer (worker). */
export const QUEUE_NAME = "scheduled-publish";

/** Poll cadence — every 30s so worst-case latency stays under the ±60s target. */
export const POLL_INTERVAL_MS = 30_000;

/** Job name used for the repeatable poll tick. */
export const POLL_JOB_NAME = "poll-due";

/** Job name used for a direct, near-term single-job enqueue. */
export const DIRECT_JOB_NAME = "publish-one";

/**
 * Deterministic key for the repeatable job. A fixed jobId means re-registering
 * (e.g. on every app boot) is idempotent and never spawns duplicate schedulers.
 */
const REPEATABLE_JOB_ID = "scheduled-publish-poller";

let queue: Queue | null = null;

/** Lazily construct the shared Queue instance. */
export function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        // Keep the queue tidy; the DB row, not the BullMQ job, is durable state.
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
        attempts: 1, // retry policy lives in the DB (attempts column), not BullMQ
      },
    });
  }
  return queue;
}

/**
 * Register the repeatable poll job (idempotent). Call once at app/worker
 * startup. Uses a fixed repeat key so repeated calls do not stack schedulers.
 */
export async function ensureRepeatable(): Promise<void> {
  const q = getQueue();
  await q.add(
    POLL_JOB_NAME,
    {},
    {
      repeat: { every: POLL_INTERVAL_MS },
      jobId: REPEATABLE_JOB_ID,
      removeOnComplete: true,
      removeOnFail: { count: 50 },
    }
  );
}

/**
 * Enqueue an immediate poll tick (does not wait for the next 30s interval).
 * Useful right after scheduling something with a near-term runAt.
 */
export async function enqueueDue(): Promise<void> {
  await getQueue().add(POLL_JOB_NAME, {}, { removeOnComplete: true });
}

/**
 * Optionally enqueue a single scheduled job to be processed after `delayMs`.
 * This is a latency optimization on top of the poller; the DB row remains the
 * source of truth and `processJob` is idempotent, so a duplicate (poller + this)
 * is harmless.
 */
export async function enqueuePublish(
  scheduledJobId: string,
  delayMs: number,
  opts: JobsOptions = {}
): Promise<void> {
  await getQueue().add(
    DIRECT_JOB_NAME,
    { scheduledJobId },
    { delay: Math.max(0, delayMs), removeOnComplete: true, ...opts }
  );
}

/** Close the queue (graceful shutdown). */
export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
