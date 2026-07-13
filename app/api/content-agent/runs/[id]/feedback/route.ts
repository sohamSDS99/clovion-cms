/** Send a READY run back through writer + QA with a human note. */
import { withRoute, parseBody, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { feedbackSchema } from "@/lib/contentagent/schemas";
import { submitFeedback } from "@/lib/contentagent/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (req: Request, ctx: Ctx) => {
  const user = await requireCapability("use_ai_write");
  const { id } = await ctx.params;
  const input = await parseBody(req, feedbackSchema);
  return json({ data: await submitFeedback(user, id, input.note) });
});
