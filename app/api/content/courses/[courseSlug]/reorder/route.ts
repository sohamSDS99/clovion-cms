/**
 * POST /api/content/courses/[courseSlug]/reorder — renumber a course's
 * lessons. `orderedIds` must be exactly the course's lesson ids in the new
 * order. Editing content is gated by edit_content (Admin/Editor).
 */
import { z } from "zod";
import { withRoute, json, parseBody } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { reorderCourse } from "@/lib/content/courseManager";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ courseSlug: string }> };

const reorderSchema = z
  .object({ orderedIds: z.array(z.string().uuid()).min(1).max(100) })
  .strict();

export const POST = withRoute(async (req: Request, ctx: Ctx) => {
  const user = await requireCapability("edit_content");
  const { courseSlug } = await ctx.params;
  const { orderedIds } = await parseBody(req, reorderSchema);
  await reorderCourse(user, courseSlug, orderedIds);
  return json({ data: { ok: true } });
});
