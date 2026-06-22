/**
 * AIProviderConfig singleton service (FR-SETTINGS-03/04, §7.3).
 *
 * The config is a single row. We never expose the encrypted key to clients:
 * `getConfig()` returns a masked view, `getDecryptedKey()` is server-internal
 * (used by the later generation wave + `testConnection`/model proxy here).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireCapability, type SessionUser } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit/service";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/ai/crypto";
import { createOpenRouterClient } from "@/lib/ai/openrouter";
import type { UpdateConfigInput } from "@/lib/ai/schemas";

/** Fixed id for the singleton row so upserts always target the same record. */
const SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

type ConfigRow = Prisma.AIProviderConfigGetPayload<object>;

/** Client-safe config: the raw key is dropped, only a mask + presence flag remain. */
export interface MaskedConfig {
  id: string;
  defaultModel: string | null;
  embeddingModel: string | null;
  maxTokens: number;
  temperature: number;
  monthlyBudgetUsd: string | null;
  hasKey: boolean;
  openrouterApiKeyMasked: string | null;
  createdAt: Date;
  updatedAt: Date;
  updatedById: string | null;
}

/** Loads the singleton row, or null if it has never been configured. */
async function loadRow(): Promise<ConfigRow | null> {
  return prisma.aIProviderConfig.findFirst();
}

/** Strips the encrypted key and returns a client-safe masked view. */
function toMasked(row: ConfigRow): MaskedConfig {
  const hasKey = Boolean(row.openrouterApiKeyEncrypted);
  let masked: string | null = null;
  if (hasKey && row.openrouterApiKeyEncrypted) {
    try {
      masked = maskSecret(decryptSecret(row.openrouterApiKeyEncrypted));
    } catch {
      // Undecryptable (e.g. rotated ENCRYPTION_KEY) — surface presence only.
      masked = "…";
    }
  }
  return {
    id: row.id,
    defaultModel: row.defaultModel,
    embeddingModel: row.embeddingModel,
    maxTokens: row.maxTokens,
    temperature: row.temperature,
    monthlyBudgetUsd: row.monthlyBudgetUsd ? row.monthlyBudgetUsd.toString() : null,
    hasKey,
    openrouterApiKeyMasked: masked,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    updatedById: row.updatedById,
  };
}

/** Returns the masked config, or sensible defaults if not yet configured. */
export async function getConfig(): Promise<MaskedConfig> {
  const row = await loadRow();
  if (!row) {
    const now = new Date();
    return {
      id: SINGLETON_ID,
      defaultModel: null,
      embeddingModel: null,
      maxTokens: 4000,
      temperature: 0.7,
      monthlyBudgetUsd: null,
      hasKey: false,
      openrouterApiKeyMasked: null,
      createdAt: now,
      updatedAt: now,
      updatedById: null,
    };
  }
  return toMasked(row);
}

/**
 * Server-internal: returns the decrypted OpenRouter key, or null if none set.
 * Never expose the result to clients.
 */
export async function getDecryptedKey(): Promise<string | null> {
  const row = await loadRow();
  if (!row?.openrouterApiKeyEncrypted) return null;
  return decryptSecret(row.openrouterApiKeyEncrypted);
}

/**
 * Upserts the singleton config (FR-SETTINGS-03). Requires `configure_ai_provider`.
 * When `apiKey` is provided it is encrypted before storage; the key is NEVER
 * placed in the audit diff (NFR-SEC-01).
 */
export async function updateConfig(
  user: SessionUser,
  input: UpdateConfigInput
): Promise<MaskedConfig> {
  await requireCapability("configure_ai_provider");

  const existing = await loadRow();

  // Build the mutable fields (key handled separately). `undefined` = leave as-is.
  const data: Prisma.AIProviderConfigUncheckedUpdateInput = {
    updatedById: user.id,
  };
  if (input.defaultModel !== undefined) data.defaultModel = input.defaultModel;
  if (input.embeddingModel !== undefined) data.embeddingModel = input.embeddingModel;
  if (input.maxTokens !== undefined) data.maxTokens = input.maxTokens;
  if (input.temperature !== undefined) data.temperature = input.temperature;
  if (input.monthlyBudgetUsd !== undefined) {
    data.monthlyBudgetUsd =
      input.monthlyBudgetUsd === null
        ? null
        : new Prisma.Decimal(input.monthlyBudgetUsd);
  }
  if (input.apiKey) {
    data.openrouterApiKeyEncrypted = encryptSecret(input.apiKey);
  }

  let row: ConfigRow;
  if (existing) {
    row = await prisma.aIProviderConfig.update({
      where: { id: existing.id },
      data,
    });
  } else {
    row = await prisma.aIProviderConfig.create({
      data: {
        id: SINGLETON_ID,
        defaultModel: input.defaultModel ?? null,
        embeddingModel: input.embeddingModel ?? null,
        maxTokens: input.maxTokens ?? 4000,
        temperature: input.temperature ?? 0.7,
        monthlyBudgetUsd:
          input.monthlyBudgetUsd != null
            ? new Prisma.Decimal(input.monthlyBudgetUsd)
            : null,
        openrouterApiKeyEncrypted: input.apiKey
          ? encryptSecret(input.apiKey)
          : null,
        updatedById: user.id,
      },
    });
  }

  // Audit WITHOUT the secret: record which fields changed + whether key was rotated.
  await recordAudit({
    actorId: user.id,
    entityType: "config",
    entityId: row.id,
    action: "updated",
    diff: {
      defaultModel: row.defaultModel,
      embeddingModel: row.embeddingModel,
      maxTokens: row.maxTokens,
      temperature: row.temperature,
      monthlyBudgetUsd: row.monthlyBudgetUsd?.toString() ?? null,
      apiKeyRotated: Boolean(input.apiKey),
    },
  });

  return toMasked(row);
}

/** Result of a connectivity check against OpenRouter. */
export interface TestConnectionResult {
  ok: boolean;
  error?: string;
  modelCount?: number;
}

/**
 * Verifies the stored key can talk to OpenRouter by listing models.
 * Returns a structured result rather than throwing for the auth-fail case.
 */
export async function testConnection(): Promise<TestConnectionResult> {
  const key = await getDecryptedKey();
  if (!key) return { ok: false, error: "No API key configured." };
  try {
    const client = createOpenRouterClient(key);
    const models = await client.listModels();
    return { ok: true, modelCount: models.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error." };
  }
}

/** Monthly spend vs budget (FR-SETTINGS-04). */
export interface BudgetStatus {
  spentUsd: number;
  budgetUsd: number | null;
  exceeded: boolean;
}

/**
 * Sums AIGenerationJob.costUsd for the current calendar month (UTC) and
 * compares to the configured monthly budget.
 */
export async function budgetStatus(): Promise<BudgetStatus> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [agg, row] = await Promise.all([
    prisma.aIGenerationJob.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: monthStart } },
    }),
    loadRow(),
  ]);

  const spentUsd = agg._sum.costUsd ? Number(agg._sum.costUsd) : 0;
  const budgetUsd = row?.monthlyBudgetUsd ? Number(row.monthlyBudgetUsd) : null;
  const exceeded = budgetUsd != null && spentUsd > budgetUsd;
  return { spentUsd, budgetUsd, exceeded };
}
