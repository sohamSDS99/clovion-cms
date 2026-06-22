/**
 * S3-compatible object storage adapter (FR-MEDIA-01).
 *
 * Works against AWS S3 in prod and local MinIO in dev (path-style addressing,
 * custom endpoint, static creds). All media bytes live here; the DB only holds
 * the storage key + derived public URL.
 *
 * Gated PDFs are never made public — they are served via short-lived signed
 * download URLs (NFR-SEC-03).
 */
import { randomUUID } from "node:crypto";
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.S3_REGION ?? "us-east-1";
const BUCKET = process.env.S3_BUCKET ?? "clovion-cms-media";
const PUBLIC_BASE_URL = (process.env.S3_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
const FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === "true";

/** Default TTL for signed download URLs of gated assets (NFR-SEC-03): 5 min. */
export const SIGNED_URL_TTL_SECONDS = 300;

/** Lazily-constructed singleton client (avoids constructing at import in tests). */
let _client: S3Client | undefined;
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: REGION,
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: FORCE_PATH_STYLE,
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }
  return _client;
}

/** Sanitize a user-supplied filename for safe use inside a storage key. */
function safeName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "file";
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9.\-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "file"
  );
}

/**
 * Build a date-partitioned, collision-free storage key:
 *   media/${yyyy}/${mm}/${uuid}-${safeFilename}
 */
export function buildStorageKey(filename: string, now = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `media/${yyyy}/${mm}/${randomUUID()}-${safeName(filename)}`;
}

/**
 * Ensure the bucket exists. HeadBucket first; CreateBucket on a 404/NotFound
 * (primarily for local MinIO bootstrap). Idempotent.
 */
export async function ensureBucket(): Promise<void> {
  try {
    await client().send(new HeadBucketCommand({ Bucket: BUCKET }));
    return;
  } catch (err) {
    const code = errCode(err);
    // 404 / NotFound / NoSuchBucket => create it. Anything else => surface.
    if (code !== 404 && code !== "NotFound" && code !== "NoSuchBucket") {
      throw err;
    }
  }
  try {
    await client().send(new CreateBucketCommand({ Bucket: BUCKET }));
  } catch (err) {
    // Tolerate races where another worker created it concurrently.
    const code = errCode(err);
    if (code !== "BucketAlreadyOwnedByYou" && code !== "BucketAlreadyExists") {
      throw err;
    }
  }
}

/** Upload bytes under `key`. Returns the key. */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

/** Delete an object (best-effort; S3 delete of a missing key is a no-op). */
export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Short-lived signed GET URL for gated downloads (e.g. gated PDFs) — NFR-SEC-03.
 * The object stays private; only holders of the signed URL can fetch it.
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds: number = SIGNED_URL_TTL_SECONDS
): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: expiresInSeconds }
  );
}

/** Public CDN/base URL for a publicly-readable object. */
export function publicUrl(key: string): string {
  return `${PUBLIC_BASE_URL}/${key}`;
}

/** Best-effort extraction of an error code from an AWS SDK error. */
function errCode(err: unknown): string | number | undefined {
  if (err && typeof err === "object") {
    const e = err as {
      name?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return e.Code ?? e.name ?? e.$metadata?.httpStatusCode;
  }
  return undefined;
}
