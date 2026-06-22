/**
 * Pure unit tests for image variant generation + upload validation.
 * No S3 / DB — sharp generates in-memory test images.
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  generateVariants,
  extractImageMeta,
  VARIANT_WIDTHS,
} from "@/lib/media/variants";
import { validateUpload, kindForMime, SIZE_LIMITS } from "@/lib/media/limits";

/** Build a solid-colour PNG of the given dimensions. */
async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 10, g: 120, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

describe("extractImageMeta", () => {
  it("returns the intrinsic dimensions", async () => {
    const png = await makePng(640, 480);
    const meta = await extractImageMeta(png);
    expect(meta).toEqual({ width: 640, height: 480 });
  });
});

describe("generateVariants", () => {
  it("emits thumb/md/lg WebP for a large raster image", async () => {
    const png = await makePng(2000, 1000);
    const variants = await generateVariants(png, "image/png");

    const byName = Object.fromEntries(variants.map((v) => [v.name, v]));
    expect(Object.keys(byName).sort()).toEqual(["lg", "md", "thumb"]);

    expect(byName.thumb.width).toBe(VARIANT_WIDTHS.thumb);
    expect(byName.md.width).toBe(VARIANT_WIDTHS.md);
    expect(byName.lg.width).toBe(VARIANT_WIDTHS.lg);

    for (const v of variants) {
      expect(v.contentType).toBe("image/webp");
      expect(v.buffer.byteLength).toBeGreaterThan(0);
      // Aspect ratio preserved (source is 2:1).
      expect(v.height).toBe(Math.round(v.width / 2));
    }
  });

  it("never upscales — a small image yields only the widths it can fill", async () => {
    const png = await makePng(400, 400);
    const variants = await generateVariants(png, "image/png");
    const names = variants.map((v) => v.name).sort();
    // 400px can only produce the 320px thumb (md/lg would upscale).
    expect(names).toEqual(["thumb"]);
    expect(variants[0].width).toBe(VARIANT_WIDTHS.thumb);
  });

  it("returns a single source-width thumb when smaller than every target", async () => {
    const png = await makePng(100, 100);
    const variants = await generateVariants(png, "image/png");
    expect(variants).toHaveLength(1);
    expect(variants[0].name).toBe("thumb");
    expect(variants[0].width).toBe(100);
  });

  it("skips non-raster types gracefully", async () => {
    const variants = await generateVariants(Buffer.from("%PDF-1.4"), "application/pdf");
    expect(variants).toEqual([]);
  });
});

describe("kindForMime", () => {
  it("maps known MIME types to kinds", () => {
    expect(kindForMime("image/png")).toBe("IMAGE");
    expect(kindForMime("image/gif")).toBe("IMAGE");
    expect(kindForMime("video/mp4")).toBe("VIDEO");
    expect(kindForMime("video/webm")).toBe("VIDEO");
    expect(kindForMime("application/pdf")).toBe("PDF");
    expect(kindForMime("application/zip")).toBe("OTHER");
  });
});

describe("validateUpload", () => {
  it("accepts within-limit files and returns the kind", () => {
    expect(validateUpload("image/jpeg", 5 * 1024 * 1024)).toBe("IMAGE");
    expect(validateUpload("application/pdf", 10 * 1024 * 1024)).toBe("PDF");
    expect(validateUpload("video/mp4", 100 * 1024 * 1024)).toBe("VIDEO");
  });

  it("rejects unsupported MIME types (422)", () => {
    expect(() => validateUpload("application/zip", 100)).toThrowError(
      /Unsupported media type/
    );
  });

  it("rejects over-limit files (422)", () => {
    expect(() => validateUpload("image/png", SIZE_LIMITS.IMAGE + 1)).toThrowError(
      /maximum allowed size/
    );
    expect(() => validateUpload("application/pdf", SIZE_LIMITS.PDF + 1)).toThrowError(
      /maximum allowed size/
    );
  });

  it("rejects empty files", () => {
    expect(() => validateUpload("image/png", 0)).toThrowError(/empty/);
  });
});
