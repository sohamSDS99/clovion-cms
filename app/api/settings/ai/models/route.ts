/**
 * Model picker proxy (FR-SETTINGS-03): lists available OpenRouter models using
 * the stored key so the key never reaches the browser. Requires
 * `configure_ai_provider`.
 */
import { json, BadRequestError, withRoute } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { getDecryptedKey } from "@/lib/ai/config";
import { createOpenRouterClient } from "@/lib/ai/openrouter";

export const runtime = "nodejs";

export const GET = withRoute(async () => {
  await requireCapability("configure_ai_provider");
  const key = await getDecryptedKey();
  if (!key) throw new BadRequestError("No OpenRouter API key configured.");
  const client = createOpenRouterClient(key);
  const models = await client.listModels();
  return json({ models });
});
