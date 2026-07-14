/** Model ids available on the configured direct providers (for dropdowns). */
import { withRoute, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import {
  getDecryptedAnthropicKey,
  getDecryptedOpenaiKey,
} from "@/lib/ai/config";
import { listProviderModels } from "@/lib/ai/providers";

export const runtime = "nodejs";

export const GET = withRoute(async () => {
  await requireCapability("configure_ai_provider");
  const [anthropicKey, openaiKey] = await Promise.all([
    getDecryptedAnthropicKey(),
    getDecryptedOpenaiKey(),
  ]);
  const [anthropic, openai] = await Promise.all([
    anthropicKey ? listProviderModels("anthropic", anthropicKey).catch(() => []) : [],
    openaiKey ? listProviderModels("openai", openaiKey).catch(() => []) : [],
  ]);
  return json({ anthropic, openai });
});
