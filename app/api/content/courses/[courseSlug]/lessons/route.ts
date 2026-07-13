/**
 * POST /api/content/courses/[courseSlug]/lessons — append an empty manual
 * lesson (DRAFT, "Untitled lesson") at the end of the course.
 */
import { withRoute, created } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { addManualLesson } from "@/lib/content/courseManager";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ courseSlug: string }> };

export const POST = withRoute(async (_req: Request, ctx: Ctx) => {
  const user = await requireCapability("create_content");
  const { courseSlug } = await ctx.params;
  const { id } = await addManualLesson(user, courseSlug);
  return created({ data: { id } });
});
