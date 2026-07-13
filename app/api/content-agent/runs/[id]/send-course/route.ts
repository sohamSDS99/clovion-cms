/**
 * POST /api/content-agent/runs/[id]/send-course — file a READY course batch
 * (outline run) into the CMS: one DRAFT COURSE item per lesson. Resumable:
 * already-filed lessons are skipped.
 */
import { withRoute, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { sendCourseBatchToCms } from "@/lib/contentagent/courseToCms";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (_req: Request, ctx: Ctx) => {
  const user = await requireCapability("create_content");
  const { id } = await ctx.params;
  return json({ data: await sendCourseBatchToCms(user, id) });
});
