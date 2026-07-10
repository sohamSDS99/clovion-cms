/**
 * PATCH /api/author-profiles/[id] — edit another user's author profile
 * (FR-USER-02). Admin only (edit_others_author_profile); the service enforces
 * the own-vs-others capability split.
 *
 * DELETE /api/author-profiles/[id] — delete a byline profile. Admin only. The
 * service refuses to delete a profile linked to a user account or still used as
 * the author on any content (409), so a byline can never be orphaned.
 */
import type { NextRequest } from "next/server";
import { withRoute, json, parseBody, noContent } from "@/lib/api/http";
import { requireUser, requireCapability } from "@/lib/auth/guard";
import { updateAuthorProfile, deleteAuthorProfile } from "@/lib/users/service";
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

export const DELETE = withRoute(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireCapability("edit_others_author_profile");
    const { id } = await ctx.params;
    await deleteAuthorProfile(user, id);
    return noContent();
  }
);
