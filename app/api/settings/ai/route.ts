/**
 * AI provider settings (FR-SETTINGS-03).
 *   GET  -> masked config (no plaintext key ever).
 *   PUT  -> upsert config (encrypts key, audits without the secret).
 * Both require the `configure_ai_provider` capability.
 */
import type { NextRequest } from "next/server";
import { json, parseBody, withRoute } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { getConfig, updateConfig } from "@/lib/ai/config";
import { updateConfigSchema } from "@/lib/ai/schemas";

export const runtime = "nodejs";

export const GET = withRoute(async () => {
  await requireCapability("configure_ai_provider");
  return json(await getConfig());
});

export const PUT = withRoute(async (req: NextRequest) => {
  const user = await requireCapability("configure_ai_provider");
  const input = await parseBody(req, updateConfigSchema);
  return json(await updateConfig(user, input));
});
