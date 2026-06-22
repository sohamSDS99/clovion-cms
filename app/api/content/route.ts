/**
 * /api/content — list (GET) and create (POST) content (FR-CONTENT-01, 03).
 */
import type { NextRequest } from "next/server";
import { withRoute, json, created, parseBody, parseQuery } from "@/lib/api/http";
import { requireUser, requireCapability } from "@/lib/auth/guard";
import {
  createContentSchema,
  listContentQuerySchema,
  type CreateContentInput,
  type ListContentQuery,
} from "@/lib/content/schemas";
import { createContent, listContent } from "@/lib/content/service";

export const runtime = "nodejs";

/** GET /api/content — list non-deleted content with filters + cursor paging. */
export const GET = withRoute(async (req: NextRequest) => {
  await requireUser();
  // Output type is inferred from the schema (supports transforms/coercion).
  const query = parseQuery(req.nextUrl.searchParams, listContentQuerySchema);
  const result = await listContent(query);
  return json(result);
});

/** POST /api/content — create a DRAFT content item (requires create_content). */
export const POST = withRoute(async (req: NextRequest) => {
  const user = await requireCapability("create_content");
  const input = await parseBody(req, createContentSchema);
  const item = await createContent(user, input);
  return created(item);
});
