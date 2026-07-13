/** Approve course lessons (draft → approved). Body {ids?: string[]} — omitted = all drafts. */
import { z } from "zod";
import { withRoute, parseBody, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { approveLessons } from "@/lib/content/courseManager";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ courseSlug: string }> };

const bodySchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).optional() })
  .strict();

export const POST = withRoute(async (req: Request, ctx: Ctx) => {
  const user = await requireCapability("submit_for_review");
  const { courseSlug } = await ctx.params;
  const raw = await req.text();
  const input = raw ? await parseBody(new Request(req.url, { method: "POST", headers: { "content-type": "application/json" }, body: raw }), bodySchema) : {};
  return json({ data: await approveLessons(user, courseSlug, (input as { ids?: string[] }).ids) });
});
