/**
 * Connectivity check for configured AI providers (FR-SETTINGS-03).
 * POST -> { ok, error?, modelCount?, providers? }. Requires `configure_ai_provider`.
 * Tests direct Anthropic/OpenAI keys when present; falls back to the legacy
 * OpenRouter check when neither direct key is set.
 */
import { json, withRoute } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import {
  testConnection,
  getDecryptedAnthropicKey,
  getDecryptedOpenaiKey,
} from "@/lib/ai/config";
import { pingProvider } from "@/lib/ai/providers";

export const runtime = "nodejs";

export const POST = withRoute(async () => {
  await requireCapability("configure_ai_provider");

  const [anthropicKey, openaiKey] = await Promise.all([
    getDecryptedAnthropicKey(),
    getDecryptedOpenaiKey(),
  ]);

  if (anthropicKey || openaiKey) {
    const results: Record<string, string> = {};
    if (anthropicKey) {
      results.anthropic = (await pingProvider("anthropic", anthropicKey)) ?? "ok";
    }
    if (openaiKey) {
      results.openai = (await pingProvider("openai", openaiKey)) ?? "ok";
    }
    const failures = Object.entries(results).filter(([, v]) => v !== "ok");
    return json({
      ok: failures.length === 0,
      providers: results,
      ...(failures.length > 0
        ? { error: failures.map(([k, v]) => `${k}: ${v}`).join("; ") }
        : {}),
    });
  }

  return json(await testConnection());
});
