/**
 * Barrel exports for the scheduled-publish job system (FR-CONTENT-06).
 *
 * The app can `import { ensureRepeatable } from "@/lib/jobs"` at startup to
 * register the repeatable poller, and use `enqueuePublish` / `enqueueDue` for
 * optional low-latency triggering.
 */

export {
  QUEUE_NAME,
  POLL_INTERVAL_MS,
  getQueue,
  ensureRepeatable,
  enqueueDue,
  enqueuePublish,
  closeQueue,
} from "./queue";

export { getConnection, closeConnection } from "./connection";

export {
  MAX_ATTEMPTS,
  SYSTEM_USER,
  shouldRetry,
  nextBackoffMs,
  filterDueJobs,
  findDueJobs,
  processJob,
  processDueJobs,
  transitionFor,
  type DueCandidate,
  type ProcessOutcome,
} from "./process";

export { startWorker } from "./worker";
