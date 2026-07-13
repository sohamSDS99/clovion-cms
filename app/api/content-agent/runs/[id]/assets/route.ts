/** Generated downloadable files (templates) attached to a run. */
import { withRoute, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { listRunAssets } from "@/lib/contentagent/course";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (_req: Request, ctx: Ctx) => {
  await requireCapability("use_ai_write");
  const { id } = await ctx.params;
  return json({ data: await listRunAssets(id) });
});
