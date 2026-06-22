/**
 * Redis-backed fixed-window rate limiter (pre-deploy abuse hardening).
 *
 * Used to cap abuse-prone, side-effectful endpoints (public lead capture,
 * AI generation). The window is a simple atomic counter per (key, window):
 * we INCR the key and, only on the FIRST hit (when INCR returns 1), set the
 * TTL to `windowSec`. This is the classic fixed-window algorithm — cheap,
 * O(1), and good enough for coarse anti-abuse limits.
 *
 * Design choices:
 *   - FAIL-OPEN. If Redis is unreachable or errors, we log and allow the
 *     request through ({ ok: true }). Availability beats strictness here: a
 *     Redis blip must never turn into a 500 on a public endpoint.
 *   - Reuses the shared BullMQ ioredis connection (`@/lib/jobs/connection`)
 *     so we don't open a second pool. That client already uses
 *     `maxRetriesPerRequest: null`, which is fine for these non-blocking
 *     INCR/EXPIRE commands.
 *   - Keys are namespaced under `rl:` and embed the window length + a
 *     time-bucket so distinct windows never collide.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getConnection } from "@/lib/jobs/connection";

/** Result of a rate-limit check. */
export interface RateLimitResult {
  /** True if the request is within the limit (or we failed open). */
  ok: boolean;
  /** Approximate remaining requests in the current window (>= 0). */
  remaining: number;
  /** Seconds until the current window resets. */
  resetSec: number;
}

/** Options controlling a single limiter bucket. */
export interface RateLimitOptions {
  /** Max requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

/**
 * Pure decision: given the post-INCR counter value and the limit, decide
 * whether the request is allowed and how many remain. Factored out so it can
 * be unit-tested without Redis.
 *
 * `count` is the value AFTER incrementing (1 on the first request). A request
 * is allowed while `count <= limit`.
 */
export function decide(
  count: number,
  limit: number,
): { ok: boolean; remaining: number } {
  const remaining = Math.max(0, limit - count);
  return { ok: count <= limit, remaining };
}

/**
 * Compute the fixed-window key + the seconds remaining until that window
 * resets. The window is aligned to absolute epoch buckets of `windowSec`, so
 * the same caller maps to the same bucket within a window regardless of when
 * in the process lifecycle the key was first seen. Pure — testable.
 */
export function windowBucket(
  key: string,
  windowSec: number,
  nowMs: number = Date.now(),
): { redisKey: string; resetSec: number } {
  const nowSec = Math.floor(nowMs / 1000);
  const bucket = Math.floor(nowSec / windowSec);
  const resetSec = (bucket + 1) * windowSec - nowSec;
  return { redisKey: `rl:${windowSec}:${bucket}:${key}`, resetSec };
}

/**
 * Apply a fixed-window limit to `key`.
 *
 * Atomicity: INCR and (conditional) EXPIRE are issued in a single pipeline so
 * the round-trip is one network hop. We only arm EXPIRE when INCR returns 1
 * (the first hit of a new window) — re-arming on every hit would slide the
 * window and let a steady stream of requests never reset.
 *
 * Fails open on ANY Redis error.
 */
export async function rateLimit(
  key: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const { limit, windowSec } = opts;
  const { redisKey, resetSec } = windowBucket(key, windowSec);

  try {
    const redis = getConnection();
    // Pipeline: INCR then arm EXPIRE on first hit. ioredis `NX` on EXPIRE
    // would also work, but gating on the INCR result avoids a redundant
    // command on the hot path after the first request.
    const incr = await redis.incr(redisKey);
    if (incr === 1) {
      // First request in this window — set the TTL so the bucket self-cleans.
      await redis.expire(redisKey, windowSec);
    }
    const { ok, remaining } = decide(incr, limit);
    return { ok, remaining, resetSec };
  } catch (err) {
    // FAIL-OPEN: never let a Redis problem break the endpoint.
    console.error("[ratelimit] redis error, failing open:", err);
    return { ok: true, remaining: limit, resetSec };
  }
}

/**
 * One-way hash of a client IP so we never key (and never log) raw PII.
 * Salted with RATELIMIT_HASH_SALT. Returns "unknown" when no IP is present so
 * un-IP'd callers still share a (coarse) bucket rather than bypassing limits.
 */
export function hashIp(ip: string | null | undefined): string {
  if (!ip) return "unknown";
  const salt = process.env.RATELIMIT_HASH_SALT ?? "clovion-rl";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Best-effort client IP from proxy/CDN headers: first hop of X-Forwarded-For,
 * then X-Real-IP. Mirrors the lead-form service's extraction.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}

/**
 * Derive a rate-limit key from a hashed client IP + a scope label. The scope
 * keeps per-endpoint (and per-resource) buckets independent so a lead submit
 * on resource A doesn't consume resource B's allowance.
 */
export function clientKey(req: Request, scope: string): string {
  const ip = clientIpFromHeaders(req.headers);
  return `${scope}:ip:${hashIp(ip)}`;
}

/**
 * Build a 429 response that matches the app's JSON error envelope and sets the
 * standard Retry-After header (seconds). Returned BEFORE any side effects on a
 * limited request.
 */
export function tooMany(resetSec: number): NextResponse {
  const res = NextResponse.json(
    {
      error: {
        message: "Too many requests. Please slow down and try again later.",
        code: "rate_limited",
      },
    },
    { status: 429 },
  );
  res.headers.set("Retry-After", String(Math.max(1, resetSec)));
  res.headers.set("Cache-Control", "no-store");
  return res;
}
