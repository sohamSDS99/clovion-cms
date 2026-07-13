/** (Re)generate downloadable assets for a finished course (incremental). */
import { withRoute, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { regenerateCourseAssets } from "@/lib/contentagent/course";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (_req: Request, ctx: Ctx) => {
  await requireCapability("use_ai_write");
  const { id } = await ctx.params;
  return json({ data: await regenerateCourseAssets(id) });
});
