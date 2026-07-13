/**
 * POST /api/content-agent/runs/[id]/add-to-course — file one READY lesson run
 * into an existing course at the next lesson number. The course comes from
 * run.targetCourseSlug; an explicit { courseSlug } in the body overrides it.
 */
import { z } from "zod";
import { withRoute, json, BadRequestError, ValidationError } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { addRunToCourse } from "@/lib/contentagent/courseToCms";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    courseSlug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Course slug must be kebab-case [a-z0-9-].")
      .max(200)
      .optional(),
  })
  .strict();

export const POST = withRoute(async (req: Request, ctx: Ctx) => {
  const user = await requireCapability("create_content");
  const { id } = await ctx.params;

  // The body is optional — an empty request means "use run.targetCourseSlug".
  let courseSlug: string | undefined;
  const raw = await req.text();
  if (raw.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestError("Request body must be valid JSON.");
    }
    const result = bodySchema.safeParse(parsed);
    if (!result.success) {
      throw new ValidationError("Validation failed.", result.error.flatten());
    }
    courseSlug = result.data.courseSlug;
  }

  return json({ data: await addRunToCourse(user, id, courseSlug) });
});
