/** Generate/refresh downloadable assets for a course from the manager. */
import { withRoute, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { regenerateCourseAssetsBySlug } from "@/lib/contentagent/course";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ courseSlug: string }> };

export const POST = withRoute(async (_req: Request, ctx: Ctx) => {
  await requireCapability("use_ai_write");
  const { courseSlug } = await ctx.params;
  return json({ data: await regenerateCourseAssetsBySlug(courseSlug) });
});
