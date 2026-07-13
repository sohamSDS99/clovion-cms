/** Start (or resume) one-click course generation from an approved outline. */
import { withRoute, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { startCourseBatch } from "@/lib/contentagent/course";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (_req: Request, ctx: Ctx) => {
  const user = await requireCapability("use_ai_write");
  const { id } = await ctx.params;
  return json({ data: await startCourseBatch(user, id) });
});
