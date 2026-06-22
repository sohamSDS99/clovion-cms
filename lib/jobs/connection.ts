/**
 * Shared ioredis connection for BullMQ (FR-CONTENT-06, §6.2).
 *
 * BullMQ REQUIRES `maxRetriesPerRequest: null` on the underlying ioredis client
 * (blocking commands like BRPOPLPUSH must not be aborted mid-flight), so we
 * centralize the connection here and reuse it for both Queue and Worker.
 *
 * Connection is created lazily so that importing this module (e.g. from the app
 * at startup to register the repeatable job) does not open a socket until it is
 * actually needed.
 */

import IORedis, { type Redis } from "ioredis";

/** Resolve the Redis URL from env, with a localhost default for dev. */
function redisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6380";
}

let connection: Redis | null = null;

/**
 * Return a process-wide singleton ioredis connection configured for BullMQ.
 * `maxRetriesPerRequest: null` and `enableReadyCheck: false` are the
 * BullMQ-recommended settings for shared connections.
 */
export function getConnection(): Redis {
  if (!connection) {
    connection = new IORedis(redisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return connection;
}

/** Close the shared connection (used on graceful shutdown). */
export async function closeConnection(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
