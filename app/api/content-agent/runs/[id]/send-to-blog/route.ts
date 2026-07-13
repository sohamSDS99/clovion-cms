/** File an article run into the blog as a DRAFT ContentItem (human action). */
import { withRoute, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { sendToBlog } from "@/lib/contentagent/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (_req: Request, ctx: Ctx) => {
  const user = await requireCapability("create_content");
  const { id } = await ctx.params;
  const result = await sendToBlog(user, id);
  return json({ data: { contentId: result.contentId, run: result.run } });
});
