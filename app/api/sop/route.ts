/**
 * Writing SOP collection routes (FR-SETTINGS-01, §10 Q8).
 *  GET  /api/sop  — list SOPs (any authenticated user; read-only for authors).
 *  POST /api/sop  — create a new SOP (requires edit_writing_sop, checked in service).
 */
import { type NextRequest } from "next/server";
import { withRoute, json, created, parseBody, parseQuery } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { createSopSchema, listSopQuerySchema } from "@/lib/sop/schemas";
import { listSops, createSop } from "@/lib/sop/service";

export const runtime = "nodejs";

export const GET = withRoute(async (req: NextRequest) => {
  // SOPs are visible to all authenticated users (read-only for authors).
  await requireUser();
  const query = parseQuery(req.nextUrl.searchParams, listSopQuerySchema);
  const sops = await listSops({
    appliesTo: query.appliesTo,
    activeOnly: query.activeOnly,
  });
  return json({ sops });
});

export const POST = withRoute(async (req: NextRequest) => {
  const user = await requireUser();
  const input = await parseBody(req, createSopSchema);
  // createSop enforces the edit_writing_sop capability server-side.
  const sop = await createSop(user, input);
  return created({ sop });
});
