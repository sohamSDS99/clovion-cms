/**
 * /api/profile — the acting user's own author profile (FR-USER-02).
 *   GET   : fetch my author profile (or null).
 *   PATCH : update my author profile (edit_own_author_profile).
 */
import type { NextRequest } from "next/server";
import { withRoute, json, parseBody, NotFoundError } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { getMyProfile, updateAuthorProfile } from "@/lib/users/service";
import { updateAuthorProfileSchema } from "@/lib/users/schemas";

export const runtime = "nodejs";

export const GET = withRoute(async () => {
  const user = await requireUser();
  const profile = await getMyProfile(user);
  return json({ profile });
});

export const PATCH = withRoute(async (req: NextRequest) => {
  const user = await requireUser();
  if (!user.authorProfileId) {
    // Viewers (and any account without a profile) have nothing to edit.
    throw new NotFoundError("You don't have an author profile to edit.");
  }
  const body = await parseBody(req, updateAuthorProfileSchema);
  const profile = await updateAuthorProfile(user, user.authorProfileId, body);
  return json(profile);
});
