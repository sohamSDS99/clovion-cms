/**
 * Course → CMS filing: turn READY course-lesson agent runs into COURSE
 * ContentItems (the course-management layer's write path from the agent).
 *
 * A lesson draft is article HTML that usually ends with an
 * "<h2>Key learnings</h2><ul>…</ul>" section; that section is lifted into
 * structured typeData.keyLearnings instead of staying in the body. Generated
 * templates (READY AgentAssets) become typeData.downloads.
 */

import { prisma } from "@/lib/db/prisma";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/api/http";
import type { SessionUser } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit/service";
import { createContent } from "@/lib/content/service";
import { slugify } from "@/lib/content/slug";
import { nextLessonNumber, getCourse } from "@/lib/content/courseManager";
import { htmlToTiptap } from "@/lib/ai/coerce";
import type { AgentRun } from "@prisma/client";
import { extractArticleMeta } from "./prompts";
import { getCourseBatch, type Syllabus } from "./course";
import { extractKeyLearnings, humanizeFilename , deriveMetaDescription } from "./courseHtml";

export { extractKeyLearnings, humanizeFilename } from "./courseHtml";

// ── Filing ────────────────────────────────────────────────────────────────────

/** Schema caps on typeData (courseTypeDataSchema): keep filed data within them. */
const MAX_KEY_LEARNINGS = 8;
const MAX_KEY_LEARNING_CHARS = 300;
const MAX_DOWNLOADS = 6;

/**
 * File one READY lesson run into a course as a DRAFT COURSE ContentItem.
 * Key learnings and downloads move into typeData; the run is linked to the
 * created item via run.contentId (making the operation resumable/idempotent).
 */
export async function fileLessonToCourse(
  user: SessionUser,
  runId: string,
  target: { courseSlug: string; courseTitle: string; lessonNumber: number }
): Promise<{ contentId: string; run: AgentRun }> {
  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
  if (!run) throw new NotFoundError("Run not found.");
  if (run.status !== "READY" || !run.draftText) {
    throw new ConflictError("The run has no finished draft yet.");
  }
  if (run.contentId) {
    throw new ConflictError("This run was already filed into the CMS.");
  }
  if (!user.authorProfileId) {
    throw new BadRequestError(
      "Your account has no author profile — set one up before filing lessons."
    );
  }

  const { title, metaDescription, body } = extractArticleMeta(run.draftText);
  const { keyLearnings, bodyWithoutSection } = extractKeyLearnings(body);
  const { doc } = htmlToTiptap(bodyWithoutSection);

  // Generated templates → downloads (READY assets with an uploaded file only).
  const assets = await prisma.agentAsset.findMany({
    where: { runId, status: "READY", mediaAssetId: { not: null } },
    orderBy: { target: "asc" },
  });
  const downloads = assets.slice(0, MAX_DOWNLOADS).map((a) => ({
    mediaAssetId: a.mediaAssetId as string,
    label: humanizeFilename(a.filename ?? a.kind),
  }));

  const item = await createContent(
    user,
    {
      type: "COURSE",
      title: title ?? run.brief.slice(0, 120),
      body: doc as unknown as Record<string, unknown>,
      authorProfileId: user.authorProfileId,
      typeData: {
        courseSlug: target.courseSlug,
        courseTitle: target.courseTitle,
        lessonNumber: target.lessonNumber,
        ...(keyLearnings.length > 0
          ? {
              keyLearnings: keyLearnings
                .slice(0, MAX_KEY_LEARNINGS)
                .map((k) => k.slice(0, MAX_KEY_LEARNING_CHARS)),
            }
          : {}),
        ...(downloads.length > 0 ? { downloads } : {}),
      },
      // Publish-gate-safe SEO: metaTitle ≤60 and a metaDescription (50–160)
      // derived from the body when the writer didn't supply one — so filed
      // lessons can be approved + published without a detour to the editor.
      seo: {
        metaTitle: (title ?? run.brief).slice(0, 60),
        ...(() => {
          const md =
            metaDescription?.slice(0, 155) ?? deriveMetaDescription(bodyWithoutSection);
          return md ? { metaDescription: md } : {};
        })(),
      },
    },
    {
      revisionSource: "AI_GENERATION",
      revisionNote: `Content Agent run ${runId}`,
    }
  );

  const updated = await prisma.agentRun.update({
    where: { id: runId },
    data: { contentId: item.id },
  });
  await recordAudit({
    actorId: user.id,
    entityType: "agent_run",
    entityId: runId,
    action: "filed_to_course",
    diff: {
      contentId: item.id,
      courseSlug: target.courseSlug,
      lessonNumber: target.lessonNumber,
    },
  });
  return { contentId: item.id, run: updated };
}

/**
 * File a whole READY course batch into the CMS: one COURSE item per lesson
 * run, in syllabus order. Already-filed lessons (run.contentId set) are
 * skipped, so a partially failed send can simply be re-triggered.
 */
export async function sendCourseBatchToCms(
  user: SessionUser,
  outlineRunId: string
): Promise<{ courseSlug: string; filed: number; skipped: number }> {
  const result = await getCourseBatch(outlineRunId);
  if (!result) throw new NotFoundError("No course batch exists for this run.");
  const { batch } = result;
  if (batch.status !== "READY") {
    throw new ConflictError("The course must finish generating before it can be filed.");
  }
  const syllabus = batch.syllabus as unknown as Syllabus | null;
  if (!syllabus?.courseTitle || !Array.isArray(syllabus.lessons)) {
    throw new ConflictError("The course batch has no syllabus.");
  }

  const courseSlug = slugify(syllabus.courseTitle);
  const lessonRunIds = (batch.lessonRunIds as string[]) ?? [];

  let filed = 0;
  let skipped = 0;
  for (let i = 0; i < syllabus.lessons.length; i++) {
    const lessonRunId = lessonRunIds[i];
    if (!lessonRunId) continue; // lesson was never generated
    const run = await prisma.agentRun.findUnique({
      where: { id: lessonRunId },
      select: { contentId: true },
    });
    if (!run || run.contentId) {
      skipped += 1;
      continue;
    }
    await fileLessonToCourse(user, lessonRunId, {
      courseSlug,
      courseTitle: syllabus.courseTitle,
      lessonNumber: i + 1,
    });
    filed += 1;
  }

  return { courseSlug, filed, skipped };
}

/**
 * File one lesson run into an existing course at the next lesson number.
 * The course comes from run.targetCourseSlug (set at run creation) or an
 * explicit override; its title is inherited from the course's lessons.
 */
export async function addRunToCourse(
  user: SessionUser,
  runId: string,
  courseSlugOverride?: string
): Promise<{ contentId: string; courseSlug: string; run: AgentRun }> {
  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
  if (!run) throw new NotFoundError("Run not found.");
  const courseSlug = courseSlugOverride ?? run.targetCourseSlug;
  if (!courseSlug) {
    throw new BadRequestError(
      "This run does not target a course — pass a courseSlug."
    );
  }

  const course = await getCourse(courseSlug); // 404s when the course is empty
  const lessonNumber = nextLessonNumber(
    course.lessons.map((l) => l.lessonNumber)
  );

  const filed = await fileLessonToCourse(user, runId, {
    courseSlug,
    courseTitle: course.courseTitle,
    lessonNumber,
  });
  return { contentId: filed.contentId, courseSlug, run: filed.run };
}
