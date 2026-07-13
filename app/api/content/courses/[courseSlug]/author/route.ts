/** Set the author byline for every lesson in a course. */
import { z } from "zod";
import { withRoute, parseBody, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { setCourseAuthor } from "@/lib/content/courseManager";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ courseSlug: string }> };

const bodySchema = z.object({ authorProfileId: z.string().uuid() }).strict();

export const POST = withRoute(async (req: Request, ctx: Ctx) => {
  const user = await requireCapability("edit_content");
  const { courseSlug } = await ctx.params;
  const input = await parseBody(req, bodySchema);
  return json({ data: await setCourseAuthor(user, courseSlug, input.authorProfileId) });
});
