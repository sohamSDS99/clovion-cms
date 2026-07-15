/** Content memory search — powers the manual "reference past content" picker. */
import { withRoute, json } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { searchContentMemory } from "@/lib/contentagent/service";

export const runtime = "nodejs";

export const GET = withRoute(async (req: Request) => {
  await requireCapability("use_ai_write");
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 300);
  const data = q ? await searchContentMemory(q) : [];
  return json({ data });
});
