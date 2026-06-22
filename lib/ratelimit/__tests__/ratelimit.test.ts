/**
 * Unit tests for the pure (Redis-free) parts of the rate limiter:
 * - `decide`           — the window/limit decision logic
 * - `windowBucket`     — epoch-aligned key + reset calculation
 * - `hashIp`           — stable, salted, non-reversible IP hashing
 * - `clientKey` / `clientIpFromHeaders` — key derivation from request headers
 * - `tooMany`          — 429 envelope + Retry-After header
 *
 * The Redis-touching `rateLimit` is exercised for its FAIL-OPEN guarantee by
 * mocking the shared connection to throw.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the shared ioredis connection BEFORE importing the module under test so
// no real socket is ever opened during the suite.
const incr = vi.fn();
const expire = vi.fn();
vi.mock("@/lib/jobs/connection", () => ({
  getConnection: () => ({ incr, expire }),
}));

import {
  decide,
  windowBucket,
  hashIp,
  clientKey,
  clientIpFromHeaders,
  tooMany,
  rateLimit,
} from "@/lib/ratelimit";

describe("decide", () => {
  it("allows requests up to and including the limit", () => {
    expect(decide(1, 5)).toEqual({ ok: true, remaining: 4 });
    expect(decide(5, 5)).toEqual({ ok: true, remaining: 0 });
  });

  it("rejects once the count exceeds the limit", () => {
    expect(decide(6, 5)).toEqual({ ok: false, remaining: 0 });
    expect(decide(100, 5)).toEqual({ ok: false, remaining: 0 });
  });

  it("never returns negative remaining", () => {
    expect(decide(10, 3).remaining).toBe(0);
  });
});

describe("windowBucket", () => {
  it("aligns the key to absolute epoch buckets of windowSec", () => {
    // nowMs = 1000s exactly, windowSec=60 => bucket = floor(1000/60) = 16
    const a = windowBucket("k", 60, 1000 * 1000);
    expect(a.redisKey).toBe("rl:60:16:k");
  });

  it("maps two timestamps in the same window to the same key", () => {
    const base = 1_000_000_000_000; // arbitrary fixed ms
    const a = windowBucket("k", 600, base);
    const b = windowBucket("k", 600, base + 5_000); // +5s, same 10-min window
    expect(a.redisKey).toBe(b.redisKey);
  });

  it("computes a positive resetSec within the window length", () => {
    const { resetSec } = windowBucket("k", 600, 1_000_000_000_000);
    expect(resetSec).toBeGreaterThan(0);
    expect(resetSec).toBeLessThanOrEqual(600);
  });

  it("rolls to a new key in the next window", () => {
    const base = 1_000_000_000_000;
    const a = windowBucket("k", 60, base);
    const b = windowBucket("k", 60, base + 60_000); // +60s => next bucket
    expect(a.redisKey).not.toBe(b.redisKey);
  });
});

describe("hashIp", () => {
  it("returns 'unknown' for empty input so callers still share a bucket", () => {
    expect(hashIp(null)).toBe("unknown");
    expect(hashIp(undefined)).toBe("unknown");
    expect(hashIp("")).toBe("unknown");
  });

  it("is deterministic and non-reversible (does not contain the raw IP)", () => {
    const ip = "203.0.113.7";
    const h1 = hashIp(ip);
    const h2 = hashIp(ip);
    expect(h1).toBe(h2);
    expect(h1).not.toContain(ip);
    expect(h1).toHaveLength(32);
  });

  it("produces different hashes for different IPs", () => {
    expect(hashIp("1.1.1.1")).not.toBe(hashIp("2.2.2.2"));
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers the first hop of x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" });
    expect(clientIpFromHeaders(h)).toBe("9.9.9.9");
  });

  it("falls back to x-real-ip", () => {
    const h = new Headers({ "x-real-ip": "8.8.8.8" });
    expect(clientIpFromHeaders(h)).toBe("8.8.8.8");
  });

  it("returns null when no client IP header is present", () => {
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});

describe("clientKey", () => {
  it("embeds the scope and hashed IP, never the raw IP", () => {
    const req = new Request("https://x.test/lead", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    const key = clientKey(req, "lead:my-slug");
    expect(key.startsWith("lead:my-slug:ip:")).toBe(true);
    expect(key).not.toContain("203.0.113.7");
  });

  it("derives the same key for the same IP+scope", () => {
    const make = () =>
      new Request("https://x.test/lead", {
        headers: { "x-forwarded-for": "203.0.113.7" },
      });
    expect(clientKey(make(), "s")).toBe(clientKey(make(), "s"));
  });

  it("derives different keys for different scopes", () => {
    const req = new Request("https://x.test/lead", {
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    expect(clientKey(req, "a")).not.toBe(clientKey(req, "b"));
  });
});

describe("tooMany", () => {
  it("returns a 429 with the rate_limited envelope and Retry-After", async () => {
    const res = tooMany(42);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    const body = await res.json();
    expect(body.error.code).toBe("rate_limited");
    expect(typeof body.error.message).toBe("string");
  });

  it("floors Retry-After at 1 second", () => {
    expect(tooMany(0).headers.get("Retry-After")).toBe("1");
  });
});

describe("rateLimit (Redis-backed)", () => {
  beforeEach(() => {
    incr.mockReset();
    expire.mockReset();
  });

  it("arms EXPIRE only on the first hit of a window", async () => {
    incr.mockResolvedValueOnce(1);
    expire.mockResolvedValueOnce(1);
    const r = await rateLimit("k", { limit: 5, windowSec: 60 });
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(4);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it("does not re-arm EXPIRE on subsequent hits", async () => {
    incr.mockResolvedValueOnce(3);
    const r = await rateLimit("k", { limit: 5, windowSec: 60 });
    expect(r.ok).toBe(true);
    expect(expire).not.toHaveBeenCalled();
  });

  it("rejects once the counter passes the limit", async () => {
    incr.mockResolvedValueOnce(6);
    const r = await rateLimit("k", { limit: 5, windowSec: 60 });
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("FAILS OPEN when Redis throws", async () => {
    incr.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await rateLimit("k", { limit: 5, windowSec: 60 });
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(5);
    spy.mockRestore();
  });
});
