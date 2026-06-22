/**
 * MIME -> MediaKind mapping and per-kind size/type limits (FR-MEDIA-01).
 *
 * Kept dependency-free (no Prisma/S3) so it can be reused by the service and
 * exercised by pure unit tests. The `MediaKind` literal union mirrors the
 * Prisma enum (UPPERCASE) exactly.
 */
import { ValidationError } from "@/lib/api/http";

export type MediaKind = "IMAGE" | "VIDEO" | "PDF" | "OTHER";

const MB = 1024 * 1024;

/** Allowed MIME types per kind and their max byte size. */
export const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);
export const VIDEO_MIME = new Set(["video/mp4", "video/webm"]);
export const PDF_MIME = new Set(["application/pdf"]);

/** Per-kind maximum upload sizes (FR-MEDIA-01). */
export const SIZE_LIMITS: Record<Exclude<MediaKind, "OTHER">, number> = {
  IMAGE: 20 * MB,
  VIDEO: 500 * MB,
  PDF: 50 * MB,
};

/** Map a MIME type to its MediaKind. Unknown types => OTHER (rejected). */
export function kindForMime(mime: string): MediaKind {
  const m = mime.toLowerCase();
  if (IMAGE_MIME.has(m)) return "IMAGE";
  if (VIDEO_MIME.has(m)) return "VIDEO";
  if (PDF_MIME.has(m)) return "PDF";
  return "OTHER";
}

/**
 * Validate a candidate upload's MIME type + byte size. Throws ValidationError
 * (422) on an unsupported type or an over-limit file. Returns the MediaKind.
 */
export function validateUpload(mime: string, sizeBytes: number): MediaKind {
  const kind = kindForMime(mime);
  if (kind === "OTHER") {
    throw new ValidationError(`Unsupported media type: ${mime}`, {
      mimeType: mime,
    });
  }
  const max = SIZE_LIMITS[kind];
  if (sizeBytes > max) {
    throw new ValidationError(
      `${kind} exceeds the maximum allowed size of ${Math.round(max / MB)}MB.`,
      { kind, sizeBytes, maxBytes: max }
    );
  }
  if (sizeBytes <= 0) {
    throw new ValidationError("Uploaded file is empty.", { sizeBytes });
  }
  return kind;
}
