/**
 * GET /api/author-profiles — list author profiles (id + display name) for the
 * editor's byline picker. Any authenticated user may read the list.
 */
import { withRoute, json } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { listAuthorProfiles } from "@/lib/users/service";

export const runtime = "nodejs";

export const GET = withRoute(async () => {
  await requireUser();
  const profiles = await listAuthorProfiles();
  return json({ profiles });
});
