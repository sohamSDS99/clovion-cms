/**
 * POST /api/agent/v1/content — external agent draft submission.
 *
 * Auth: scoped agent API key (Authorization: Bearer agk_… or x-api-key).
 * Behavior: creates a DRAFT only. There is no lifecycle surface on this API —
 * publishing remains a human action in the admin UI (mirrors the in-app AI
 * writing engine's hard rule).
 */
import { withRoute, parseBody, json } from "@/lib/api/http";
import { rateLimit, tooMany } from "@/lib/ratelimit";
import { requireAgentKey, SCOPE_DRAFT_CREATE } from "@/lib/agent/keys";
import { agentCreateContentSchema } from "@/lib/agent/schemas";
import { createAgentDraft } from "@/lib/agent/service";

export const runtime = "nodejs";

export const POST = withRoute(async (req: Request) => {
  const principal = await requireAgentKey(req, SCOPE_DRAFT_CREATE);

  const rl = await rateLimit(`agent:content:${principal.keyId}`, {
    limit: 30,
    windowSec: 60,
  });
  if (!rl.ok) return tooMany(rl.resetSec);

  const input = await parseBody(req, agentCreateContentSchema);
  const result = await createAgentDraft(principal, input);

  return json(
    { data: result },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
});
