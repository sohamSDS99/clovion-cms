/**
 * Course manager — the course-level view over COURSE content items.
 *
 * A "course" is not a row anywhere: it is the set of non-deleted COURSE
 * ContentItems sharing `typeData.courseSlug`, ordered by the 1-based
 * `typeData.lessonNumber`. This module groups, reads, reorders and extends
 * that set. Lesson lifecycle (publish/unpublish/delete) stays in the editor.
 */

import type { ContentItem, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { validateForPublish } from "@/lib/workflow";
import { transitionContent } from "@/lib/content/service";
import { deriveMetaDescription } from "@/lib/contentagent/courseHtml";
import type { SessionUser } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit/service";
import { renderTiptapToHtml } from "@/lib/public/render";
import { BadRequestError, NotFoundError } from "@/lib/api/http";
import { createContent } from "./service";

/** The typeData shape of a COURSE lesson (see courseTypeDataSchema). */
export interface CourseTypeData {
  courseSlug?: string;
  courseTitle?: string;
  lessonNumber?: number;
  keyLearnings?: string[];
  downloads?: { mediaAssetId: string; label: string }[];
}

export interface CourseSummary {
  courseSlug: string;
  courseTitle: string;
  lessonCount: number;
  assetCount: number;
  publishedCount: number;
  draftCount: number;
  updatedAt: string;
}

export interface CourseLesson {
  id: string;
  title: string;
  slug: string;
  status: ContentItem["status"];
  lessonNumber: number;
  excerpt: string | null;
  keyLearnings: string[];
  downloads: { mediaAssetId: string; label: string; url: string | null; filename: string | null }[];
  updatedAt: string;
  /** Publish-gate problems (empty = ready to publish). */
  publishIssues: string[];
  authorProfileId: string;
}

export interface CourseDetail {
  courseSlug: string;
  courseTitle: string;
  lessons: CourseLesson[];
  /** Shared author when every lesson agrees; null when mixed/absent. */
  courseAuthorId: string | null;
}

// ── Pure helpers (unit-tested) ────────────────────────────────────────────────

/**
 * Validate that `orderedIds` is exactly the set of `currentIds` (no missing,
 * no unknown, no duplicate ids) and map each id to its new 1-based
 * lessonNumber. Throws BadRequestError on any mismatch.
 */
export function buildReorderPlan(
  currentIds: string[],
  orderedIds: string[]
): { id: string; lessonNumber: number }[] {
  if (orderedIds.length !== currentIds.length) {
    throw new BadRequestError(
      `Expected ${currentIds.length} lesson ids, received ${orderedIds.length}.`
    );
  }
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (seen.has(id)) throw new BadRequestError(`Duplicate lesson id: ${id}.`);
    seen.add(id);
  }
  const current = new Set(currentIds);
  for (const id of orderedIds) {
    if (!current.has(id)) {
      throw new BadRequestError(`Lesson ${id} does not belong to this course.`);
    }
  }
  return orderedIds.map((id, index) => ({ id, lessonNumber: index + 1 }));
}

/** Next 1-based lesson number after the existing ones (1 for an empty list). */
export function nextLessonNumber(existing: number[]): number {
  const max = existing.reduce(
    (acc, n) => (Number.isFinite(n) && n > acc ? n : acc),
    0
  );
  return max + 1;
}

/** Read the lessonNumber out of an opaque typeData Json (0 when absent). */
export function lessonNumberOf(typeData: unknown): number {
  const n = (typeData as CourseTypeData | null)?.lessonNumber;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** All non-deleted lessons of one course, ordered by lessonNumber. */
async function courseLessonRows(courseSlug: string): Promise<ContentItem[]> {
  const rows = await prisma.contentItem.findMany({
    where: {
      type: "COURSE",
      deletedAt: null,
      typeData: { path: ["courseSlug"], equals: courseSlug },
    },
  });
  return rows.sort(
    (a, b) => lessonNumberOf(a.typeData) - lessonNumberOf(b.typeData)
  );
}

/** All courses: COURSE items grouped by typeData.courseSlug, newest first. */
export async function listCourses(): Promise<CourseSummary[]> {
  const rows = await prisma.contentItem.findMany({
    where: { type: "COURSE", deletedAt: null },
    select: { id: true, status: true, typeData: true, updatedAt: true },
  });

  const groups = new Map<string, CourseSummary>();
  for (const row of rows) {
    const data = (row.typeData ?? {}) as CourseTypeData;
    const slug = data.courseSlug;
    if (!slug) continue; // malformed lesson: not addressable as a course
    const existing = groups.get(slug);
    const summary: CourseSummary = existing ?? {
      courseSlug: slug,
      courseTitle: data.courseTitle ?? slug,
      lessonCount: 0,
      assetCount: 0,
      publishedCount: 0,
      draftCount: 0,
      updatedAt: row.updatedAt.toISOString(),
    };
    summary.lessonCount += 1;
    summary.assetCount += (data.downloads ?? []).length;
    if (row.status === "PUBLISHED") summary.publishedCount += 1;
    if (row.status === "DRAFT") summary.draftCount += 1;
    if (row.updatedAt.toISOString() > summary.updatedAt) {
      summary.updatedAt = row.updatedAt.toISOString();
    }
    if (data.courseTitle) summary.courseTitle = data.courseTitle;
    groups.set(slug, summary);
  }

  return [...groups.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

/** One course: its lessons in order, downloads resolved to media URLs. */
export async function getCourse(courseSlug: string): Promise<CourseDetail> {
  const rows = await courseLessonRows(courseSlug);
  if (rows.length === 0) throw new NotFoundError("Course not found.");

  // Resolve every referenced media asset in one query.
  const mediaIds = rows.flatMap((row) =>
    (((row.typeData ?? {}) as CourseTypeData).downloads ?? []).map(
      (d) => d.mediaAssetId
    )
  );
  const media = mediaIds.length
    ? await prisma.mediaAsset.findMany({
        where: { id: { in: mediaIds } },
        select: { id: true, url: true, filename: true },
      })
    : [];
  const mediaById = new Map(media.map((m) => [m.id, m]));

  const lessons: CourseLesson[] = rows.map((row) => {
    const data = (row.typeData ?? {}) as CourseTypeData;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      lessonNumber: lessonNumberOf(row.typeData),
      excerpt: row.excerpt,
      keyLearnings: data.keyLearnings ?? [],
      downloads: (data.downloads ?? []).map((d) => ({
        mediaAssetId: d.mediaAssetId,
        label: d.label,
        url: mediaById.get(d.mediaAssetId)?.url ?? null,
        filename: mediaById.get(d.mediaAssetId)?.filename ?? null,
      })),
      updatedAt: row.updatedAt.toISOString(),
      authorProfileId: row.authorProfileId,
      publishIssues: lessonPublishIssues({
        type: "COURSE",
        title: row.title,
        slug: row.slug,
        seo: row.seo,
        coverAssetId: row.coverAssetId,
        typeData: row.typeData,
      }),
    };
  });

  const courseTitle =
    lessons
      .map((_, i) => ((rows[i].typeData ?? {}) as CourseTypeData).courseTitle)
      .find(Boolean) ?? courseSlug;

  const authorIds = new Set(lessons.map((l) => l.authorProfileId));
  const courseAuthorId = authorIds.size === 1 ? lessons[0].authorProfileId : null;

  return { courseSlug, courseTitle, lessons, courseAuthorId };
}

/** Set the author byline on every lesson in the course. */
export async function setCourseAuthor(
  user: SessionUser,
  courseSlug: string,
  authorProfileId: string
): Promise<{ updated: number }> {
  const profile = await prisma.authorProfile.findUnique({
    where: { id: authorProfileId },
  });
  if (!profile) throw new NotFoundError("Author profile not found.");
  const rows = await courseLessonRows(courseSlug);
  if (rows.length === 0) throw new NotFoundError("Course not found.");
  await prisma.$transaction(
    rows.map((row) =>
      prisma.contentItem.update({
        where: { id: row.id },
        data: { authorProfileId, updatedById: user.id },
      })
    )
  );
  await recordAudit({
    actorId: user.id,
    entityType: "content",
    entityId: rows[0].id,
    action: "course_author_set",
    diff: { courseSlug, authorProfileId, lessons: rows.length },
  });
  return { updated: rows.length };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Reorder a course: `orderedIds` must be exactly the course's lesson ids in
 * the desired order. Rewrites typeData.lessonNumber (read-modify-write of the
 * Json) for every lesson in one transaction.
 */
export async function reorderCourse(
  user: SessionUser,
  courseSlug: string,
  orderedIds: string[]
): Promise<void> {
  const rows = await courseLessonRows(courseSlug);
  if (rows.length === 0) throw new NotFoundError("Course not found.");

  const plan = buildReorderPlan(
    rows.map((r) => r.id),
    orderedIds
  );
  const byId = new Map(rows.map((r) => [r.id, r]));

  await prisma.$transaction(
    plan.map(({ id, lessonNumber }) => {
      const row = byId.get(id)!;
      const typeData = {
        ...((row.typeData ?? {}) as Record<string, unknown>),
        lessonNumber,
      };
      return prisma.contentItem.update({
        where: { id },
        data: {
          typeData: typeData as Prisma.InputJsonValue,
          updatedById: user.id,
        },
      });
    })
  );

  await recordAudit({
    actorId: user.id,
    entityType: "content",
    entityId: orderedIds[0],
    action: "course_reordered",
    diff: { courseSlug, orderedIds },
  });
}

/**
 * Append an empty manual lesson ("Untitled lesson", DRAFT, empty body) at the
 * end of an existing course. Course title is inherited from a current lesson.
 */
export async function addManualLesson(
  user: SessionUser,
  courseSlug: string
): Promise<{ id: string }> {
  const rows = await courseLessonRows(courseSlug);
  if (rows.length === 0) throw new NotFoundError("Course not found.");
  if (!user.authorProfileId) {
    throw new BadRequestError(
      "Your account has no author profile — set one up before adding lessons."
    );
  }

  const courseTitle =
    rows
      .map((r) => ((r.typeData ?? {}) as CourseTypeData).courseTitle)
      .find(Boolean) ?? courseSlug;
  const lessonNumber = nextLessonNumber(rows.map((r) => lessonNumberOf(r.typeData)));

  const item = await createContent(user, {
    type: "COURSE",
    title: "Untitled lesson",
    authorProfileId: user.authorProfileId,
    typeData: { courseSlug, courseTitle, lessonNumber },
  });
  return { id: item.id };
}

// ── Continuity source for the Content Agent ───────────────────────────────────

/** Max characters of each lesson's HTML fed to the writer for continuity. */
const CONTINUITY_LESSON_CHARS = 6000;

/**
 * Compose source material for a run that targets an existing course: the
 * course title plus every current lesson (title + body HTML, trimmed) so the
 * writer keeps continuity and doesn't re-teach covered ground.
 */
export async function buildCourseSourceReport(courseSlug: string): Promise<string> {
  const rows = await courseLessonRows(courseSlug);
  if (rows.length === 0) {
    throw new NotFoundError(
      `Course "${courseSlug}" has no lessons yet — nothing to write into.`
    );
  }
  const courseTitle =
    rows
      .map((r) => ((r.typeData ?? {}) as CourseTypeData).courseTitle)
      .find(Boolean) ?? courseSlug;

  const parts = rows.map((row) => {
    let html = row.bodyHtml ?? "";
    if (!html) {
      try {
        html = renderTiptapToHtml(row.body);
      } catch {
        html = "";
      }
    }
    const n = lessonNumberOf(row.typeData);
    return `--- LESSON ${n} — ${row.title} (already in the course, do not re-teach) ---\n${html.slice(0, CONTINUITY_LESSON_CHARS)}`;
  });

  return `COURSE: ${courseTitle}\nThe lessons below already exist in this course. Write the new lesson to continue them: same voice, no repetition, reference earlier lessons where useful.\n\n${parts.join("\n\n")}`;
}


/** Pure: which lifecycle action publishes a lesson from its current status. */
export function publishActionFor(
  status: string
): "publish_now" | "approve_publish" | null {
  if (status === "DRAFT") return "publish_now";
  if (status === "IN_REVIEW" || status === "SCHEDULED") return "approve_publish";
  return null; // PUBLISHED (no-op) or archived states
}

/** Publish-gate issues for a lesson (empty = ready). */
export function lessonPublishIssues(item: {
  type: "COURSE";
  title: string;
  slug: string;
  seo: unknown;
  coverAssetId?: string | null;
  typeData: unknown;
}): string[] {
  const result = validateForPublish({
    type: "COURSE",
    title: item.title,
    slug: item.slug,
    slugUniqueInType: true, // per-type unique index guarantees this for existing rows
    seo: (item.seo ?? {}) as { metaTitle?: string; metaDescription?: string },
    coverAssetId: item.coverAssetId ?? null,
    typeData: (item.typeData ?? {}) as Record<string, never>,
  });
  return result.errors.map((e) => e.message);
}

/** Approve lessons (DRAFT → IN_REVIEW). ids omitted = all drafts in course. */
export async function approveLessons(
  user: SessionUser,
  courseSlug: string,
  ids?: string[]
): Promise<{ approved: number }> {
  const course = await getCourse(courseSlug);
  const targets = course.lessons.filter(
    (l) => l.status === "DRAFT" && (!ids || ids.includes(l.id))
  );
  for (const l of targets) {
    await transitionContent(user, l.id, "submit");
  }
  return { approved: targets.length };
}

/**
 * Backfill publish-gate SEO on a lesson when missing (metaTitle from the
 * lesson title; metaDescription derived from the body). Returns true if it
 * changed anything.
 */
async function backfillLessonSeo(lessonId: string): Promise<boolean> {
  const item = await prisma.contentItem.findUnique({ where: { id: lessonId } });
  if (!item) return false;
  const seo = (item.seo ?? {}) as { metaTitle?: string; metaDescription?: string };
  // Repair missing AND out-of-bounds values (gate: title ≤60, description 50–160).
  const mt = seo.metaTitle?.trim() ?? "";
  const needsTitle = mt.length === 0 || mt.length > 60;
  const md = seo.metaDescription?.trim() ?? "";
  const needsDescription = md.length < 50 || md.length > 160;
  if (!needsTitle && !needsDescription) return false;

  let description = seo.metaDescription;
  if (needsDescription) {
    let html = item.bodyHtml ?? "";
    if (!html) {
      try {
        html = renderTiptapToHtml(item.body as never) ?? "";
      } catch {
        html = "";
      }
    }
    description =
      deriveMetaDescription(html) ??
      deriveMetaDescription(`<p>${item.title}. ${item.excerpt ?? ""} Part of this course on AI visibility from Clovion.</p>`) ??
      undefined;
  }
  await prisma.contentItem.update({
    where: { id: lessonId },
    data: {
      seo: {
        ...seo,
        ...(needsTitle ? { metaTitle: (mt || item.title).slice(0, 60) } : {}),
        ...(description ? { metaDescription: description.slice(0, 160) } : {}),
      } as never,
    },
  });
  return true;
}

/**
 * Publish the course — all-or-nothing: SEO is backfilled, then EVERY lesson
 * is validated; if any lesson is blocked, nothing publishes. Only a fully
 * clean course goes live (a course with missing lessons is worse than a
 * course published an hour later).
 */
export async function publishCourse(
  user: SessionUser,
  courseSlug: string
): Promise<{ published: number; skipped: number; failed: { id: string; error: string }[] }> {
  // 1 — Backfill missing SEO on every publishable lesson.
  const pre = await getCourse(courseSlug);
  const publishable = pre.lessons.filter((l) => publishActionFor(l.status) !== null);
  for (const l of publishable) {
    await backfillLessonSeo(l.id);
  }

  // 2 — Validate everything (post-backfill). Any blocker stops the whole run.
  const course = await getCourse(courseSlug);
  const blocked = course.lessons
    .filter((l) => publishActionFor(l.status) !== null && l.publishIssues.length > 0)
    .map((l) => ({ id: l.id, error: l.publishIssues.join(" · ") }));
  if (blocked.length > 0) {
    return { published: 0, skipped: 0, failed: blocked };
  }

  // 3 — Publish. Validation passed for all, so failures here are unexpected;
  // report them precisely (already-published lessons are unaffected no-ops).
  let published = 0;
  let skipped = 0;
  const failed: { id: string; error: string }[] = [];
  for (const l of course.lessons) {
    const action = publishActionFor(l.status);
    if (!action) {
      skipped += 1;
      continue;
    }
    try {
      await transitionContent(user, l.id, action);
      published += 1;
    } catch (err) {
      const details = (err as { details?: { errors?: { message: string }[] } }).details;
      const detailMsg = details?.errors?.map((e) => e.message).join(" · ");
      failed.push({
        id: l.id,
        error: detailMsg || (err instanceof Error ? err.message : String(err)),
      });
    }
  }
  return { published, skipped, failed };
}
