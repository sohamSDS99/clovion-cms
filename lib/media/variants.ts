/**
 * Image processing for the media library (FR-MEDIA-02).
 *
 * Pure-ish (sharp-only, no S3/DB) so it is unit-testable in isolation. Produces
 * responsive WebP renditions for raster images. Vector (SVG), animated GIF, and
 * non-raster inputs are skipped gracefully (no variants) — they are stored as
 * their original only by the service layer.
 */
import sharp from "sharp";

/** Responsive variant target widths (FR-MEDIA-02). */
export const VARIANT_WIDTHS = {
  thumb: 320,
  md: 768,
  lg: 1280,
} as const;

export type VariantName = keyof typeof VARIANT_WIDTHS;

export interface GeneratedVariant {
  name: VariantName;
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
}

/** Raster MIME types we will derive WebP variants from. */
const RASTER_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/** Read intrinsic pixel dimensions of an image buffer. */
export async function extractImageMeta(
  buffer: Buffer
): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

/**
 * Generate thumb/md/lg WebP variants for raster images.
 *
 * - Only emits widths smaller than (or equal to) the source width — we never
 *   upscale, so a 400px-wide image yields only `thumb`.
 * - Animated GIFs and any non-raster type return `[]` (original kept as-is).
 * - `withoutEnlargement` keeps aspect ratio and avoids upscaling.
 */
export async function generateVariants(
  buffer: Buffer,
  mime: string
): Promise<GeneratedVariant[]> {
  const normalized = mime.toLowerCase();
  if (!RASTER_MIME.has(normalized)) return [];

  // Detect animated images (e.g. animated WebP/GIF) and skip — re-encoding a
  // single frame would silently drop the animation.
  let sourceWidth = 0;
  try {
    const meta = await sharp(buffer).metadata();
    if (meta.pages && meta.pages > 1) return [];
    sourceWidth = meta.width ?? 0;
  } catch {
    // Unreadable as a raster image — skip variant generation gracefully.
    return [];
  }

  const out: GeneratedVariant[] = [];
  for (const name of Object.keys(VARIANT_WIDTHS) as VariantName[]) {
    const targetWidth = VARIANT_WIDTHS[name];
    // Skip widths that would upscale the source.
    if (sourceWidth && targetWidth > sourceWidth) continue;

    const { data, info } = await sharp(buffer)
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    out.push({
      name,
      buffer: data,
      contentType: "image/webp",
      width: info.width,
      height: info.height,
    });
  }

  // If the source was smaller than every target (no upscaling), still emit a
  // single `thumb` at the source's own width so the UI always has a small.
  if (out.length === 0 && sourceWidth > 0) {
    const { data, info } = await sharp(buffer)
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    out.push({
      name: "thumb",
      buffer: data,
      contentType: "image/webp",
      width: info.width,
      height: info.height,
    });
  }

  return out;
}
