/**
 * Zod schemas for Content CRUD + lifecycle transitions (FR-CONTENT-01..11).
 *
 * Five content types share one table; type-specific fields live in `typeData`
 * (single-table inheritance). The base create/update schemas validate the
 * shared columns; per-type `typeData` refinements validate the discriminated
 * payload for each `ContentType`.
 */

import { z } from "zod";

// ── Enums (mirror Prisma UPPERCASE enum values) ───────────────────────────────

export const contentTypeSchema = z.enum([
  "BLOG",
  "WEBINAR",
  "NEWS",
  "RESOURCE",
  "FAQ",
]);
export type ContentTypeInput = z.infer<typeof contentTypeSchema>;

/** Transition actions — must match `TransitionAction` in lib/workflow. */
export const transitionActionSchema = z.enum([
  "submit",
  "approve_publish",
  "schedule",
  "publish_now",
  "cancel_schedule",
  "auto_publish",
  "unpublish",
  "archive",
  "reject",
  "restore_to_draft",
]);

// ── Shared sub-schemas ────────────────────────────────────────────────────────

/** SEO metadata stored on `ContentItem.seo`. */
export const seoSchema = z
  .object({
    metaTitle: z.string().max(70).optional(),
    metaDescription: z.string().max(200).optional(),
    canonicalUrl: z.string().url().optional(),
    ogImageAssetId: z.string().uuid().optional(),
    noindex: z.boolean().optional(),
  })
  .strict();

const uuid = z.string().uuid();

// ── Per-type `typeData` schemas (single-table inheritance) ────────────────────

/** BLOG has no extra structured fields. */
export const blogTypeDataSchema = z.object({}).passthrough();

/** WEBINAR: scheduling + registration details. */
export const webinarTypeDataSchema = z
  .object({
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    timezone: z.string().optional(),
    registrationUrl: z.string().url().optional(),
    speakerNames: z.array(z.string()).optional(),
    recordingUrl: z.string().url().optional(),
  })
  .passthrough();

/** RESOURCE: gated downloadable asset (PDF, whitepaper, etc.). */
export const resourceTypeDataSchema = z
  .object({
    resourceKind: z
      .enum(["EBOOK", "WHITEPAPER", "TEMPLATE", "CHECKLIST", "OTHER"])
      .optional(),
    pdfAssetId: uuid.optional(),
    gated: z.boolean().optional(),
    fileSizeLabel: z.string().optional(),
  })
  .passthrough();

/** FAQ: a list of question/answer items. */
export const faqItemSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});
export const faqTypeDataSchema = z
  .object({
    faqItems: z.array(faqItemSchema).optional(),
  })
  .passthrough();

/** NEWS: external source attribution. */
export const newsTypeDataSchema = z
  .object({
    sourceUrl: z.string().url().optional(),
    dateline: z.string().optional(),
    sourceName: z.string().optional(),
  })
  .passthrough();

/**
 * Validate `typeData` against the schema for a given content type.
 * Returns the parsed payload or throws ZodError. Used inside create/update
 * superRefine so errors surface as 422 with field paths.
 */
export function typeDataSchemaFor(type: ContentTypeInput) {
  switch (type) {
    case "BLOG":
      return blogTypeDataSchema;
    case "WEBINAR":
      return webinarTypeDataSchema;
    case "RESOURCE":
      return resourceTypeDataSchema;
    case "FAQ":
      return faqTypeDataSchema;
    case "NEWS":
      return newsTypeDataSchema;
  }
}

// ── Tiptap body (opaque JSON doc) ─────────────────────────────────────────────

/** Tiptap document JSON — validated structurally elsewhere; opaque here. */
const tiptapDoc = z.record(z.string(), z.any());

// ── Create ────────────────────────────────────────────────────────────────────

export const createContentSchema = z
  .object({
    type: contentTypeSchema,
    title: z.string().min(1, "Title is required.").max(300),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be kebab-case [a-z0-9-].")
      .max(200)
      .optional(),
    excerpt: z.string().max(500).optional(),
    body: tiptapDoc.optional(),
    categoryId: uuid.optional(),
    tags: z.array(z.string().min(1)).optional(),
    seo: seoSchema.optional(),
    typeData: z.record(z.string(), z.any()).optional(),
    coverAssetId: uuid.optional(),
    authorProfileId: uuid.optional(),
  })
  .superRefine((data, ctx) => {
    // Validate type-specific payload against the matching schema.
    if (data.typeData !== undefined) {
      const schema = typeDataSchemaFor(data.type);
      const result = schema.safeParse(data.typeData);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({ ...issue, path: ["typeData", ...issue.path] });
        }
      }
    }
  });
export type CreateContentInput = z.infer<typeof createContentSchema>;

// ── Update ────────────────────────────────────────────────────────────────────

/**
 * Partial update. `source` distinguishes a manual save (creates a MANUAL
 * revision) from a lightweight autosave (creates an AUTOSAVE revision).
 * `type` is NOT updatable — content type is immutable after creation.
 */
export const updateContentSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be kebab-case [a-z0-9-].")
      .max(200)
      .optional(),
    excerpt: z.string().max(500).nullable().optional(),
    body: tiptapDoc.optional(),
    categoryId: uuid.nullable().optional(),
    tags: z.array(z.string().min(1)).optional(),
    seo: seoSchema.optional(),
    typeData: z.record(z.string(), z.any()).optional(),
    coverAssetId: uuid.nullable().optional(),
    authorProfileId: uuid.optional(),
    revisionNote: z.string().max(500).optional(),
    /** Save intent: "manual" (default, applied in service) or "autosave". */
    source: z.enum(["manual", "autosave"]).optional(),
  })
  .strict();
export type UpdateContentInput = z.infer<typeof updateContentSchema>;

// ── Transition ────────────────────────────────────────────────────────────────

export const transitionSchema = z
  .object({
    action: transitionActionSchema,
    /** Required (and must be in the future) for the `schedule` action. */
    scheduledAt: z.string().datetime().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "schedule" && !data.scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledAt"],
        message: "scheduledAt is required when action is 'schedule'.",
      });
    }
  });
export type TransitionInput = z.infer<typeof transitionSchema>;

// ── Restore revision ──────────────────────────────────────────────────────────

export const restoreRevisionSchema = z.object({
  revisionId: uuid,
});
export type RestoreRevisionInput = z.infer<typeof restoreRevisionSchema>;

// ── List query ────────────────────────────────────────────────────────────────

export const contentStatusSchema = z.enum([
  "DRAFT",
  "IN_REVIEW",
  "SCHEDULED",
  "PUBLISHED",
  "UNPUBLISHED",
  "ARCHIVED",
]);

export const listContentQuerySchema = z.object({
  type: contentTypeSchema.optional(),
  status: contentStatusSchema.optional(),
  authorProfileId: uuid.optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: uuid.optional(),
});
export type ListContentQuery = z.infer<typeof listContentQuerySchema>;
