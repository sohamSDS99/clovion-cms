/** Remove a learned rule from future prompts. */
import { withRoute, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { deactivateLesson } from "@/lib/contentagent/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withRoute(async (_req: Request, ctx: Ctx) => {
  const user = await requireCapability("use_ai_write");
  const { id } = await ctx.params;
  await deactivateLesson(user, id);
  return json({ data: { removed: true } });
});
