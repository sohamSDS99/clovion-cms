/**
 * Zod schemas for Knowledge Base API routes (FR-SETTINGS-02).
 */
import { z } from "zod";

/** Mirrors the KbSourceType enum (UPPERCASE per Prisma convention). */
export const kbSourceTypeSchema = z.enum(["DOC", "URL", "PASTED_TEXT", "PDF"]);

/**
 * Create payload. For URL items the `url` holds the source location; for all
 * other types `rawContent` holds the (already-extracted) text. We normalize
 * both into the single `rawContent` column at the route layer.
 */
export const createKbItemSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(300),
    sourceType: kbSourceTypeSchema,
    rawContent: z.string().optional(),
    url: z.string().url().optional(),
    tags: z.array(z.string().trim().min(1)).max(50).default([]),
  })
  .refine(
    (v) => (v.sourceType === "URL" ? Boolean(v.url) : Boolean(v.rawContent)),
    {
      message:
        "URL source requires `url`; DOC/PDF/PASTED_TEXT require `rawContent`.",
      path: ["rawContent"],
    }
  );

export type CreateKbItemInput = z.infer<typeof createKbItemSchema>;

/** List query params: optional tag + status filter and pagination. */
export const listKbItemsQuerySchema = z.object({
  tag: z.string().trim().min(1).optional(),
  status: z.enum(["PROCESSING", "READY", "FAILED"]).optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export type ListKbItemsQuery = z.infer<typeof listKbItemsQuerySchema>;
