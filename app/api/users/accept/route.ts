/**
 * POST /api/users/accept — UNAUTHENTICATED invite acceptance (FR-USER-01).
 *
 * This is the ONLY unauthenticated mutation in the user surface. It is gated
 * strictly by a single-use invite token + expiry. It never reveals whether an
 * email/account exists: every failure is a generic 400. Does NOT log the user
 * in — the client redirects to /login on success.
 */
import type { NextRequest } from "next/server";
import { withRoute, json, parseBody } from "@/lib/api/http";
import { acceptInvite } from "@/lib/users/service";
import { acceptInviteSchema } from "@/lib/users/schemas";

export const runtime = "nodejs";

export const POST = withRoute(async (req: NextRequest) => {
  // Intentionally NO requireUser — token-gated.
  const body = await parseBody(req, acceptInviteSchema);
  const result = await acceptInvite(body);
  return json(result);
});
