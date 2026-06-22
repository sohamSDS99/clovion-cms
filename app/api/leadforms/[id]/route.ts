/**
 * Single lead form routes (FR §6.2 RESOURCE delta, NG3, PRD Q4).
 *  GET    /api/leadforms/[id] — fetch one (ADMIN/EDITOR).
 *  PATCH  /api/leadforms/[id] — partial edit (ADMIN/EDITOR).
 *  DELETE /api/leadforms/[id] — delete; 409 if used by a published gated resource.
 */
import { type NextRequest } from "next/server";
import { withRoute, json, noContent, parseBody } from "@/lib/api/http";
import { requireEditorOrAdmin } from "@/lib/leadform/guard";
import { updateLeadFormSchema } from "@/lib/leadform/schemas";
import { getLeadForm, updateLeadForm, deleteLeadForm } from "@/lib/leadform/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (_req: NextRequest, { params }: Ctx) => {
  await requireEditorOrAdmin();
  const { id } = await params;
  const form = await getLeadForm(id);
  return json({ form });
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireEditorOrAdmin();
  const { id } = await params;
  const input = await parseBody(req, updateLeadFormSchema);
  const form = await updateLeadForm(user, id, input);
  return json({ form });
});

export const DELETE = withRoute(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireEditorOrAdmin();
  const { id } = await params;
  await deleteLeadForm(user, id);
  return noContent();
});
