/**
 * POST /api/users/[id]/resend-invite — regenerate token + resend the invite
 * email (FR-USER-01). Admin only (manage_users). Returns the fresh acceptUrl.
 */
import type { NextRequest } from "next/server";
import { withRoute, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { resendInvite } from "@/lib/users/service";

export const runtime = "nodejs";

export const POST = withRoute(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireCapability("manage_users");
    const { id } = await ctx.params;
    const result = await resendInvite(actor, id);
    return json(result);
  }
);
