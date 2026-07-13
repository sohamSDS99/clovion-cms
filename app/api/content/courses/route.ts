/** GET /api/content/courses — all courses (COURSE items grouped by courseSlug). */
import { withRoute, json } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/guard";
import { listCourses } from "@/lib/content/courseManager";

export const runtime = "nodejs";

export const GET = withRoute(async () => {
  await requireUser();
  return json({ data: await listCourses() });
});
