/**
 * Zod schemas for AI provider config input (FR-SETTINGS-03) and the AI
 * generation request body (§6.1, shared contract for POST /api/ai/generate).
 */
import { z } from "zod";

/**
 * Update payload for the singleton AIProviderConfig. All fields optional so the
 * settings form can patch individual values. `apiKey`, when present, is the raw
 * plaintext key that the server encrypts — it is never read back to the client.
 */
export const updateConfigSchema = z
  .object({
    // Provide to (re)set the OpenRouter key; omit to leave the stored key as-is.
    apiKey: z.string().trim().min(1).optional(),
    defaultModel: z.string().trim().min(1).nullish(),
    embeddingModel: z.string().trim().min(1).nullish(),
    maxTokens: z.number().int().positive().max(200_000).optional(),
    temperature: z.number().min(0).max(2).optional(),
    // Monetary budget in USD; null clears the cap. Stored as Prisma Decimal.
    monthlyBudgetUsd: z.number().nonnegative().max(1_000_000).nullish(),
  })
  .strict();

export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;

// ── AI generation request (POST /api/ai/generate) ─────────────────────────────

export const aiContentTypeSchema = z.enum([
  "BLOG",
  "RESEARCH",
  "WEBINAR",
  "NEWS",
  "RESOURCE",
  "FAQ",
]);

export const aiModeSchema = z.enum([
  "full_draft",
  "section",
  "rewrite",
  "outline",
]);

/** Free-form authoring brief; required fields depend on `mode` (refined below). */
export const generationBriefSchema = z
  .object({
    topic: z.string().max(2000).optional(),
    keywords: z.array(z.string().min(1).max(120)).max(50).optional(),
    outline: z.string().max(8000).optional(),
    sectionName: z.string().max(300).optional(),
    selectedText: z.string().max(20000).optional(),
    lengthTarget: z.string().max(120).optional(),
  })
  .strip();

export const generateRequestSchema = z
  .object({
    contentId: z.string().uuid().optional(),
    contentType: aiContentTypeSchema,
    mode: aiModeSchema,
    brief: generationBriefSchema,
    kbTags: z.array(z.string().min(1).max(120)).max(50).optional(),
    /** Admin-only override to proceed when the monthly budget is exceeded (FR-SETTINGS-04). */
    budgetOverride: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.mode === "section" && !data.brief.sectionName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["brief", "sectionName"],
        message: "sectionName is required when mode is 'section'.",
      });
    }
    if (data.mode === "rewrite" && !data.brief.selectedText?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["brief", "selectedText"],
        message: "selectedText is required when mode is 'rewrite'.",
      });
    }
    if (
      (data.mode === "full_draft" || data.mode === "outline") &&
      !data.brief.topic?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["brief", "topic"],
        message: "topic is required for full_draft and outline modes.",
      });
    }
  });

export type GenerateRequestInput = z.infer<typeof generateRequestSchema>;
