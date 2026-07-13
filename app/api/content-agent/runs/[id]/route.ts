/** Content Agent run — read (poll) + edit draft. */
import { withRoute, parseBody, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { updateDraftSchema } from "@/lib/contentagent/schemas";
import { getRun, updateDraft, deleteRun } from "@/lib/contentagent/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (_req: Request, ctx: Ctx) => {
  await requireCapability("use_ai_write");
  const { id } = await ctx.params;
  return json({ data: await getRun(id) });
});

export const PATCH = withRoute(async (req: Request, ctx: Ctx) => {
  const user = await requireCapability("use_ai_write");
  const { id } = await ctx.params;
  const input = await parseBody(req, updateDraftSchema);
  return json({ data: await updateDraft(user, id, input) });
});

export const DELETE = withRoute(async (_req: Request, ctx: Ctx) => {
  const user = await requireCapability("use_ai_write");
  const { id } = await ctx.params;
  await deleteRun(user, id);
  return json({ data: { deleted: true } });
});
