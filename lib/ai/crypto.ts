/**
 * Secret crypto for AI provider credentials (NFR-SEC-01, §7.3).
 *
 * The OpenRouter API key is encrypted at rest with AES-256-GCM. Plaintext is
 * NEVER returned to clients or written to the audit log — see `lib/ai/config.ts`.
 *
 * Blob format: `base64(iv).base64(authTag).base64(ciphertext)` — three URL-safe
 * base64 segments joined by ".". GCM gives us integrity (auth tag), so any
 * tampering causes `decryptSecret` to throw on the auth check.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce is the recommended size for GCM.
const KEY_LENGTH = 32; // 256-bit key.

/**
 * Resolves the 32-byte AES key from the base64 `ENCRYPTION_KEY` env var.
 * Throws a clear error if missing or the wrong length, so misconfiguration
 * fails fast at first use rather than producing silently-bad ciphertext.
 */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Provide a base64-encoded 32-byte key."
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("ENCRYPTION_KEY must be valid base64.");
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes (got ${key.length}).`
    );
  }
  return key;
}

/** Encrypts a plaintext secret into a self-contained base64 blob. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

/**
 * Decrypts a blob produced by `encryptSecret`. Throws if the blob is malformed
 * or if the auth tag does not verify (tampering / wrong key).
 */
export function decryptSecret(blob: string): string {
  const parts = blob.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed secret blob.");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");
  if (iv.length !== IV_LENGTH) {
    throw new Error("Malformed secret blob: bad IV length.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  // `final()` throws if the auth tag does not verify.
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Produces a safe display string for a secret: a short prefix, an ellipsis, and
 * the last 4 chars (e.g. "sk-or-…1a2b"). Used by `getConfig` so the UI can show
 * "a key is set" without ever receiving plaintext.
 */
export function maskSecret(plaintext: string): string {
  if (!plaintext) return "";
  const last4 = plaintext.slice(-4);
  // Keep up to the first 6 characters as a recognizable prefix.
  const prefix = plaintext.slice(0, Math.min(6, Math.max(0, plaintext.length - 4)));
  return `${prefix}…${last4}`;
}
