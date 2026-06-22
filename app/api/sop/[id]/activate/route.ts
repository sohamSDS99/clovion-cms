/**
 * Activate a Writing SOP (FR-SETTINGS-01, §10 Q8).
 *  POST /api/sop/[id]/activate — requires activate_writing_sop (ADMIN only).
 *
 * Enforces "exactly one active SOP per content type" by deactivating other
 * active SOPs whose appliesTo overlaps this one.
 */
import { type NextRequest } from "next/server";
import { withRoute, json } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { activateSop } from "@/lib/sop/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  // activateSop enforces the activate_writing_sop capability (ADMIN only).
  const { activated, deactivatedIds } = await activateSop(user, id);
  return json({ sop: activated, deactivatedIds });
});
