/**
 * Zod validation schemas for Writing SOP management (FR-SETTINGS-01, §10 Q8).
 */
import { z } from "zod";

/** Mirrors the Prisma ContentType enum (UPPERCASE values). */
export const contentTypeEnum = z.enum([
  "BLOG",
  "RESEARCH",
  "WEBINAR",
  "NEWS",
  "RESOURCE",
  "COURSE",
  "FAQ",
]);

/** POST /api/sop — create a new (inactive, v1) SOP. */
export const createSopSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  body: z.string().min(1, "Body is required."),
  appliesTo: z
    .array(contentTypeEnum)
    .nonempty("appliesTo must list at least one content type."),
});

/** PATCH /api/sop/[id] — partial edit of name/body/appliesTo. */
export const updateSopSchema = createSopSchema.partial().refine(
  (v) => v.name !== undefined || v.body !== undefined || v.appliesTo !== undefined,
  { message: "At least one field must be provided." }
);

/** GET /api/sop query filters. */
export const listSopQuerySchema = z.object({
  appliesTo: contentTypeEnum.optional(),
  activeOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export type CreateSopInput = z.infer<typeof createSopSchema>;
export type UpdateSopInput = z.infer<typeof updateSopSchema>;
export type ListSopQuery = z.infer<typeof listSopQuerySchema>;
