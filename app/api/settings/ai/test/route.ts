/**
 * Connectivity check against OpenRouter using the stored key (FR-SETTINGS-03).
 * POST -> { ok, error?, modelCount? }. Requires `configure_ai_provider`.
 */
import { json, withRoute } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { testConnection } from "@/lib/ai/config";

export const runtime = "nodejs";

export const POST = withRoute(async () => {
  await requireCapability("configure_ai_provider");
  return json(await testConnection());
});
