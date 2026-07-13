/** Learned style rules (the auto-improvement loop's memory). */
import { withRoute, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { listLessons } from "@/lib/contentagent/service";

export const runtime = "nodejs";

export const GET = withRoute(async () => {
  await requireCapability("use_ai_write");
  return json({ data: await listLessons() });
});
