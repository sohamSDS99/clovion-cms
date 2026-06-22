/**
 * /api/content/[id]/transition — drive a lifecycle transition (FR-CONTENT-08).
 *
 * The fine-grained role/state/policy authorization is performed by the service
 * via authorizeTransition (which maps to 409 invalid-state / 403 forbidden).
 * We only require an authenticated, non-VIEWER-capable user at the route edge.
 */
import type { NextRequest } from "next/server";
import { withRoute, json, parseBody } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { transitionSchema } from "@/lib/content/schemas";
import { transitionContent } from "@/lib/content/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/content/[id]/transition — { action, scheduledAt? }. */
export const POST = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const { action, scheduledAt } = await parseBody(req, transitionSchema);
  const item = await transitionContent(user, id, action, scheduledAt);
  return json(item);
});
