/**
 * /api/content/[id]/revisions — list (GET) and restore (POST) revisions.
 * (FR-CONTENT-10)
 */
import type { NextRequest } from "next/server";
import { withRoute, json, parseBody } from "@/lib/api/http";
import { requireUser, requireCapability } from "@/lib/auth/guard";
import { restoreRevisionSchema } from "@/lib/content/schemas";
import { listRevisions, restoreRevision } from "@/lib/content/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/content/[id]/revisions — list revisions newest-first. */
export const GET = withRoute(async (_req: NextRequest, { params }: Ctx) => {
  await requireUser();
  const { id } = await params;
  const revisions = await listRevisions(id);
  return json({ items: revisions });
});

/** POST /api/content/[id]/revisions — { revisionId } restore a snapshot. */
export const POST = withRoute(async (req: NextRequest, { params }: Ctx) => {
  // Coarse gate; OWN enforced in service against the loaded row.
  const user = await requireCapability("edit_content", { isOwner: true });
  const { id } = await params;
  const { revisionId } = await parseBody(req, restoreRevisionSchema);
  const item = await restoreRevision(user, id, revisionId);
  return json(item);
});
