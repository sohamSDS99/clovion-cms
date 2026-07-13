/**
 * Content Agent runs — create + list.
 * POST creates a run and kicks the pipeline off in the background;
 * clients poll GET /api/content-agent/runs/[id] for progress.
 */
import { withRoute, parseBody, parseQuery, json, created } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { rateLimit, tooMany } from "@/lib/ratelimit";
import { createRunSchema, listRunsQuerySchema } from "@/lib/contentagent/schemas";
import { createRun, listRuns } from "@/lib/contentagent/service";

export const runtime = "nodejs";

export const POST = withRoute(async (req: Request) => {
  const user = await requireCapability("use_ai_write");
  const rl = await rateLimit(`content-agent:create:${user.id}`, {
    limit: 10,
    windowSec: 3600,
  });
  if (!rl.ok) return tooMany(rl.resetSec);
  const input = await parseBody(req, createRunSchema);
  const run = await createRun(user, input);
  return created({ data: run });
});

export const GET = withRoute(async (req: Request) => {
  await requireCapability("use_ai_write");
  const { searchParams } = new URL(req.url);
  const query = parseQuery(searchParams, listRunsQuerySchema);
  const result = await listRuns(query);
  return json({ data: result.data, pagination: { nextCursor: result.nextCursor } });
});
