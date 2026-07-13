/** Publish every approved lesson in a course (the human "make it live" action). */
import { withRoute, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { publishCourse } from "@/lib/content/courseManager";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ courseSlug: string }> };

export const POST = withRoute(async (_req: Request, ctx: Ctx) => {
  const user = await requireCapability("publish_now");
  const { courseSlug } = await ctx.params;
  return json({ data: await publishCourse(user, courseSlug) });
});
