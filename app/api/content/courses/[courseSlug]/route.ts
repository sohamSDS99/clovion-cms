/** GET /api/content/courses/[courseSlug] — one course with ordered lessons. */
import { withRoute, json } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { getCourse } from "@/lib/content/courseManager";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ courseSlug: string }> };

export const GET = withRoute(async (_req: Request, ctx: Ctx) => {
  await requireUser();
  const { courseSlug } = await ctx.params;
  return json({ data: await getCourse(courseSlug) });
});
