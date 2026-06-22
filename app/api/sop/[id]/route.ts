/**
 * Single Writing SOP routes (FR-SETTINGS-01, §10 Q8).
 *  GET    /api/sop/[id]  — fetch one SOP (any authenticated user).
 *  PATCH  /api/sop/[id]  — edit (requires edit_writing_sop; bumps version).
 *  DELETE /api/sop/[id]  — delete (requires edit_writing_sop; blocked if active).
 */
import { type NextRequest } from "next/server";
import { withRoute, json, noContent, parseBody } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { updateSopSchema } from "@/lib/sop/schemas";
import { getSop, updateSop, deleteSop } from "@/lib/sop/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (_req: NextRequest, { params }: Ctx) => {
  await requireUser();
  const { id } = await params;
  const sop = await getSop(id);
  return json({ sop });
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const input = await parseBody(req, updateSopSchema);
  const sop = await updateSop(user, id, input);
  return json({ sop });
});

export const DELETE = withRoute(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await deleteSop(user, id);
  return noContent();
});
