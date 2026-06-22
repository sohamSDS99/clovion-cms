/**
 * BullMQ worker for scheduled publishing (FR-CONTENT-06, §6.2).
 *
 * Run directly with `pnpm worker` (tsx lib/jobs/worker.ts).
 *
 * On each job:
 *  - POLL_JOB_NAME ("poll-due"): scan the DB for all due jobs and process them,
 *    then run the webinar auto-transition pass (§6.2 webinar delta) on the same
 *    tick so it shares the existing repeatable poll cadence (no new scheduler).
 *  - DIRECT_JOB_NAME ("publish-one"): process a single named job immediately.
 *
 * The worker never throws out of a processor; per-job failures are persisted to
 * the DB (attempts/status) by `processJob`, so the worker loop keeps running.
 * Graceful shutdown on SIGTERM/SIGINT drains in-flight work and closes Redis.
 */

import { Worker, type Job } from "bullmq";
import { getConnection, closeConnection } from "./connection";
import {
  QUEUE_NAME,
  POLL_JOB_NAME,
  DIRECT_JOB_NAME,
  ensureRepeatable,
  closeQueue,
} from "./queue";
import { processDueJobs, processJob } from "./process";
import { processWebinarFlip } from "./webinar";

/** Processor invoked by BullMQ for each queued job. */
async function handle(job: Job): Promise<void> {
  if (job.name === DIRECT_JOB_NAME) {
    const scheduledJobId = (job.data as { scheduledJobId?: string }).scheduledJobId;
    if (scheduledJobId) {
      const outcome = await processJob(scheduledJobId);
      console.log(`[scheduled-publish] direct ${scheduledJobId}: ${outcome.result}`);
    }
    return;
  }

  // Default / POLL_JOB_NAME: process everything currently due.
  const outcomes = await processDueJobs();
  if (outcomes.length > 0) {
    const summary = outcomes.reduce<Record<string, number>>((acc, o) => {
      acc[o.result] = (acc[o.result] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`[scheduled-publish] poll processed ${outcomes.length}:`, summary);
  }

  // Webinar auto-transition (§6.2): runs on the same tick. Self-contained +
  // never throws, so it cannot disrupt the scheduled-publish loop.
  const flips = await processWebinarFlip();
  const flipped = flips.filter((f) => f.flipped).length;
  if (flipped > 0) {
    console.log(`[webinar-auto] flipped ${flipped} webinar(s) to recorded`);
  }
}

/** Build and start the worker. Exported for programmatic startup/tests. */
export function startWorker(): Worker {
  const worker = new Worker(QUEUE_NAME, handle, {
    connection: getConnection(),
    concurrency: 1, // single-threaded poll loop; DB claim guards real safety
  });

  worker.on("failed", (job, err) => {
    // Should be rare — processJob swallows its own errors. This catches
    // unexpected processor-level faults.
    console.error(`[scheduled-publish] job ${job?.id} threw: ${err.message}`);
  });
  worker.on("error", (err) => {
    console.error(`[scheduled-publish] worker error: ${err.message}`);
  });

  return worker;
}

/** Wire graceful shutdown for the given worker. */
function installShutdown(worker: Worker): void {
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[scheduled-publish] ${signal} received, shutting down...`);
    try {
      await worker.close(); // waits for in-flight jobs to finish
      await closeQueue();
      await closeConnection();
    } catch (err) {
      console.error(`[scheduled-publish] shutdown error: ${(err as Error).message}`);
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

/** Entrypoint when run directly via `tsx lib/jobs/worker.ts`. */
async function main(): Promise<void> {
  await ensureRepeatable(); // self-register the repeatable poll on boot
  const worker = startWorker();
  installShutdown(worker);
  console.log(`[scheduled-publish] worker started on queue "${QUEUE_NAME}"`);
}

// Detect "run directly" in a tsx/ESM-friendly way without importing node:url at
// module top-level cost. argv[1] points at this file when launched directly.
const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /lib[\\/]+jobs[\\/]+worker\.ts$/.test(process.argv[1] ?? "");

if (isDirectRun) {
  main().catch((err) => {
    console.error(`[scheduled-publish] fatal startup error: ${(err as Error).message}`);
    process.exit(1);
  });
}
