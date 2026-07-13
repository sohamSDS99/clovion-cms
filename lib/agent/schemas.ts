/**
 * Request schema for the external agent API (POST /api/agent/v1/content).
 *
 * Differences from the in-app createContentSchema:
 * - Body arrives as HTML (`bodyHtml`) and is converted server-side through the
 *   hardened htmlToTiptap sanitizer (lib/ai/coerce.ts) — agents never submit
 *   raw Tiptap JSON.
 * - No status/lifecycle fields exist at all: submissions are always DRAFT.
 */
import { z } from "zod";
import {
  contentTypeSchema,
  seoSchema,
  typeDataSchemaFor,
} from "@/lib/content/schemas";

export const agentCreateContentSchema = z
  .object({
    type: contentTypeSchema,
    title: z.string().min(1).max(300),
    slug: z
      .string()
      .min(1)
      .max(300)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be kebab-case [a-z0-9-].")
      .optional(),
    excerpt: z.string().max(500).optional(),
    /** Article body as HTML. Sanitized + converted to Tiptap JSON server-side. */
    bodyHtml: z.string().min(1).max(500_000),
    tags: z.array(z.string().min(1).max(60)).max(20).optional(),
    seo: seoSchema.optional(),
    typeData: z.record(z.string(), z.any()).optional(),
    categoryId: z.string().uuid().optional(),
    /** Override byline; defaults to the author profile configured on the key. */
    authorProfileId: z.string().uuid().optional(),
    /** Free-form note stored on the first revision (e.g. brief/run id). */
    revisionNote: z.string().max(500).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.typeData === undefined) return;
    const schema = typeDataSchemaFor(data.type);
    const result = schema.safeParse(data.typeData);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: ["typeData", ...issue.path] });
      }
    }
  });

export type AgentCreateContentInput = z.infer<typeof agentCreateContentSchema>;
