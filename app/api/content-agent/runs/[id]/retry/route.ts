/** Re-run a finished/failed generation from scratch. */
import { withRoute, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { retryRun } from "@/lib/contentagent/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (_req: Request, ctx: Ctx) => {
  const user = await requireCapability("use_ai_write");
  const { id } = await ctx.params;
  return json({ data: await retryRun(user, id) });
});
