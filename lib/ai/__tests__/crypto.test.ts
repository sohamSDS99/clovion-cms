/**
 * Unit tests for secret crypto (NFR-SEC-01). No network/DB.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

// A valid 32-byte base64 key MUST exist before the module reads env.
// crypto.ts reads ENCRYPTION_KEY lazily (inside getKey), but set it up-front anyway.
const VALID_KEY = randomBytes(32).toString("base64");

let encryptSecret: typeof import("@/lib/ai/crypto").encryptSecret;
let decryptSecret: typeof import("@/lib/ai/crypto").decryptSecret;
let maskSecret: typeof import("@/lib/ai/crypto").maskSecret;

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = VALID_KEY;
  const mod = await import("@/lib/ai/crypto");
  encryptSecret = mod.encryptSecret;
  decryptSecret = mod.decryptSecret;
  maskSecret = mod.maskSecret;
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips plaintext", () => {
    const plaintext = "sk-or-v1-abcdef0123456789";
    const blob = encryptSecret(plaintext);
    expect(decryptSecret(blob)).toBe(plaintext);
  });

  it("produces ciphertext that differs from plaintext", () => {
    const plaintext = "sk-or-secret-value";
    const blob = encryptSecret(plaintext);
    expect(blob).not.toContain(plaintext);
    // 3 base64 segments: iv.tag.ciphertext
    expect(blob.split(".")).toHaveLength(3);
  });

  it("uses a fresh IV so identical plaintext yields different blobs", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
  });

  it("throws when the auth tag / ciphertext is tampered with", () => {
    const blob = encryptSecret("tamper-me-please");
    const [iv, tag, data] = blob.split(".");
    // Flip a byte in the ciphertext segment.
    const buf = Buffer.from(data, "base64");
    buf[0] = buf[0] ^ 0xff;
    const tampered = [iv, tag, buf.toString("base64")].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws on a malformed blob", () => {
    expect(() => decryptSecret("not-a-valid-blob")).toThrow();
  });
});

describe("maskSecret", () => {
  it("hides the middle and keeps a prefix + last4", () => {
    const masked = maskSecret("sk-or-v1-1234567890abcd");
    expect(masked).toContain("…");
    expect(masked.endsWith("abcd")).toBe(true);
    expect(masked.startsWith("sk-or-")).toBe(true);
    expect(masked).not.toContain("567890");
  });

  it("returns empty string for empty input", () => {
    expect(maskSecret("")).toBe("");
  });
});

describe("getKey validation", () => {
  it("throws a clear error when ENCRYPTION_KEY is the wrong length", async () => {
    process.env.ENCRYPTION_KEY = Buffer.from("tooshort").toString("base64");
    // Re-import fresh so getKey re-reads env at call time (it reads lazily, so
    // calling encrypt with the bad key set should throw).
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
    // Restore a valid key for any later runs.
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });
});
