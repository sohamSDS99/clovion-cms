/**
 * PATCH /api/author-profiles/[id] — edit another user's author profile
 * (FR-USER-02). Admin only (edit_others_author_profile); the service enforces
 * the own-vs-others capability split.
 */
import type { NextRequest } from "next/server";
import { withRoute, json, parseBody } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { updateAuthorProfile } from "@/lib/users/service";
import { updateAuthorProfileSchema } from "@/lib/users/schemas";

export const runtime = "nodejs";

export const PATCH = withRoute(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await parseBody(req, updateAuthorProfileSchema);
    const profile = await updateAuthorProfile(user, id, body);
    return json(profile);
  }
);
