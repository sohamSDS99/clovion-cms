/**
 * Zod schemas for AI provider config input (FR-SETTINGS-03).
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
