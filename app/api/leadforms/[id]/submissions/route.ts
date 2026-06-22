/**
 * Lead form submissions (FR §6.2 RESOURCE delta, NG3, PRD Q4).
 *  GET /api/leadforms/[id]/submissions — paginated submissions (ADMIN/EDITOR).
 *
 * Newest-first, cursor-paginated. Returns captured email, per-field `data`,
 * timestamp, and the originating contentId (when the submission came through a
 * specific gated resource).
 */
import { type NextRequest } from "next/server";
import { withRoute, json, parseQuery } from "@/lib/api/http";
import { requireEditorOrAdmin } from "@/lib/leadform/guard";
import { listSubmissionsQuerySchema } from "@/lib/leadform/schemas";
import { listSubmissions } from "@/lib/leadform/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  await requireEditorOrAdmin();
  const { id } = await params;
  const query = parseQuery(req.nextUrl.searchParams, listSubmissionsQuerySchema);
  const result = await listSubmissions(id, {
    limit: query.limit,
    cursor: query.cursor,
  });
  return json({ submissions: result.items, nextCursor: result.nextCursor });
});
