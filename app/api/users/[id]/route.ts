/**
 * PATCH  /api/users/[id] — change a user's role and/or status (FR-USER-01).
 * DELETE /api/users/[id] — permanently remove a user.
 * Admin only (manage_users). Blocks last-active-Admin lockout (409).
 */
import type { NextRequest } from "next/server";
import { withRoute, json, parseBody } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { updateUser, deleteUser } from "@/lib/users/service";
import { updateUserSchema } from "@/lib/users/schemas";

export const runtime = "nodejs";

export const PATCH = withRoute(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireCapability("manage_users");
    const { id } = await ctx.params;
    const body = await parseBody(req, updateUserSchema);
    const user = await updateUser(actor, id, body);
    return json(user);
  }
);

export const DELETE = withRoute(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireCapability("manage_users");
    const { id } = await ctx.params;
    await deleteUser(actor, id);
    return json({ ok: true });
  }
);
