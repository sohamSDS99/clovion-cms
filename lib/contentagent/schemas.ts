import { z } from "zod";

export const agentChannelSchema = z.enum([
  "LINKEDIN_PERSONAL",
  "LINKEDIN_COMPANY",
  "META_SOCIAL",
  "FACEBOOK",
  "INSTAGRAM",
  "BLOG_ARTICLE",
  "REPORT_ARTICLE",
  "WEBSITE",
]);

export const createRunSchema = z
  .object({
    channel: agentChannelSchema,
    postType: z.string().min(1).max(60),
    format: z.string().min(1).max(60).optional(),
    allowResearch: z.boolean().optional(),
    keywords: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
    designSize: z
      .string()
      .regex(/^\d{3,4}x\d{3,4}$/)
      .optional(),
    brief: z.string().min(10, "Give the agents a real brief.").max(20_000),
    sourceReport: z.string().min(1).max(300_000).optional(),
    // Kebab-case slug of an existing course this run writes a lesson for.
    targetCourseSlug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Course slug must be kebab-case [a-z0-9-].")
      .max(200)
      .optional(),
  })
  .strict();
export type CreateRunInput = z.infer<typeof createRunSchema>;

export const feedbackSchema = z
  .object({ note: z.string().min(3).max(5_000) })
  .strict();

export const updateDraftSchema = z
  .object({
    draftText: z.string().min(1).max(300_000).optional(),
    specText: z.string().max(100_000).optional(),
    captionText: z.string().max(20_000).optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.draftText !== undefined ||
      d.specText !== undefined ||
      d.captionText !== undefined,
    { message: "Provide at least one field to update." }
  );

export const listRunsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
