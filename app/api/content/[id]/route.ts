/**
 * /api/content/[id] — read (GET), update (PATCH), soft-delete (DELETE).
 * (FR-CONTENT-03, 04, 05, 06)
 *
 * Mutating routes gate the coarse capability here; row-state-aware ownership
 * checks happen inside the service against the loaded row.
 */
import type { NextRequest } from "next/server";
import { withRoute, json, noContent, parseBody } from "@/lib/api/http";
import { requireUser, requireCapability } from "@/lib/auth/guard";
import {
  updateContentSchema,
  type UpdateContentInput,
} from "@/lib/content/schemas";
import { getContent, updateContent, softDeleteContent } from "@/lib/content/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/content/[id] — fetch one (404 if missing/deleted). */
export const GET = withRoute(async (_req: NextRequest, { params }: Ctx) => {
  await requireUser();
  const { id } = await params;
  const item = await getContent(id);
  return json(item);
});

/** PATCH /api/content/[id] — update fields + append a revision. */
export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  // Coarse gate; ownership (OWN for AUTHOR/CONTRIBUTOR) enforced in service.
  const user = await requireCapability("edit_content", { isOwner: true });
  const { id } = await params;
  // Output type inferred from the schema.
  const input = await parseBody(req, updateContentSchema);
  const item = await updateContent(user, id, input);
  return json(item);
});

/** DELETE /api/content/[id] — soft-delete (AUTHOR: own DRAFT only). */
export const DELETE = withRoute(async (_req: NextRequest, { params }: Ctx) => {
  // Coarse gate; OWN_DRAFT_ONLY enforced in service against the real row.
  const user = await requireCapability("delete_content", {
    isOwner: true,
    isDraft: true,
  });
  const { id } = await params;
  await softDeleteContent(user, id);
  return noContent();
});
