/** Save the edited lesson plan on a course-outline run. */
import { z } from "zod";
import { withRoute, parseBody, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { updateOutlineSyllabus } from "@/lib/contentagent/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    courseTitle: z.string().min(1).max(200),
    lessons: z
      .array(
        z.object({
          title: z.string().max(200),
          brief: z.string().max(2000).default(""),
          assets: z.array(z.any()).max(3).optional(),
        })
      )
      .max(10),
  })
  .strict();

export const PUT = withRoute(async (req: Request, ctx: Ctx) => {
  const user = await requireCapability("use_ai_write");
  const { id } = await ctx.params;
  const input = await parseBody(req, bodySchema);
  return json({ data: await updateOutlineSyllabus(user, id, input) });
});
