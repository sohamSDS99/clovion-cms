/**
 * Lead form collection routes (FR §6.2 RESOURCE delta, NG3, PRD Q4).
 *  GET  /api/leadforms — list all lead forms (ADMIN/EDITOR).
 *  POST /api/leadforms — create a lead form (ADMIN/EDITOR).
 */
import { type NextRequest } from "next/server";
import { withRoute, json, created, parseBody } from "@/lib/api/http";
import { requireEditorOrAdmin } from "@/lib/leadform/guard";
import { createLeadFormSchema } from "@/lib/leadform/schemas";
import { listLeadForms, createLeadForm } from "@/lib/leadform/service";

export const runtime = "nodejs";

export const GET = withRoute(async () => {
  await requireEditorOrAdmin();
  const forms = await listLeadForms();
  return json({ forms });
});

export const POST = withRoute(async (req: NextRequest) => {
  const user = await requireEditorOrAdmin();
  const input = await parseBody(req, createLeadFormSchema);
  const form = await createLeadForm(user, input);
  return created({ form });
});
