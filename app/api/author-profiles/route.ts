/**
 * GET /api/author-profiles
 *
 * Default (no params): lightweight list of `{ id, displayName }` for the
 * editor's byline picker. Any authenticated user may read it. This shape is
 * consumed by the content editor and MUST stay backward-compatible.
 *
 * `?view=admin`: the richer author-profile oversight listing for the admin
 * screen. Gated by `edit_others_author_profile` (Admin only). Each row carries
 * the full editable fields plus a resolved `createdByEmail`.
 */
import type { NextRequest } from "next/server";
import { withRoute, json } from "@/lib/api/http";
import { requireUser, requireCapability } from "@/lib/auth/guard";
import { listAuthorProfiles, listAuthorProfilesAdmin } from "@/lib/users/service";

export const runtime = "nodejs";

export const GET = withRoute(async (req: NextRequest) => {
  const view = new URL(req.url).searchParams.get("view");

  if (view === "admin") {
    // Privileged listing — server-side capability gate (never trust the client).
    await requireCapability("edit_others_author_profile");
    const profiles = await listAuthorProfilesAdmin();
    return json({ profiles });
  }

  // Default byline-picker shape. Unchanged for backward compatibility.
  await requireUser();
  const profiles = await listAuthorProfiles();
  return json({ profiles });
});
