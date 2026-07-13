/**
 * Pure course-navigation math for COURSE lessons (public API).
 *
 * A course is the group of COURSE items sharing `typeData.courseSlug`; each
 * lesson carries a 1-based `lessonNumber`. Given the published lessons of one
 * course and the slug of the lesson being viewed, compute the ordered lesson
 * list plus prev/next pointers. Kept free of Prisma/IO so it stays trivially
 * unit-testable (see __tests__/courseNav.test.ts).
 */

/** One published lesson of a course, as projected by the query layer. */
export interface CourseLesson {
  slug: string;
  title: string;
  lessonNumber: number;
  readMinutes?: number;
  downloadsCount?: number;
  excerpt: string | null;
}

/** Minimal pointer to a sibling lesson. */
export interface CourseLessonRef {
  slug: string;
  title: string;
}

/** Course navigation block attached to a public COURSE payload. */
export interface CourseNav {
  /** All lessons ordered by lessonNumber (slug as a stable tiebreaker). */
  lessons: CourseLesson[];
  prev: CourseLessonRef | null;
  next: CourseLessonRef | null;
}

/**
 * Order lessons and locate the previous/next siblings of `currentSlug`.
 * When the current lesson is not in `lessons` (e.g. data drift), prev/next
 * are null but the ordered list is still returned.
 */
export function computeCourseNav(
  lessons: CourseLesson[],
  currentSlug: string,
): CourseNav {
  const ordered = [...lessons].sort(
    (a, b) => a.lessonNumber - b.lessonNumber || a.slug.localeCompare(b.slug),
  );
  const i = ordered.findIndex((l) => l.slug === currentSlug);
  const ref = (l: CourseLesson | undefined): CourseLessonRef | null =>
    l ? { slug: l.slug, title: l.title } : null;
  return {
    lessons: ordered,
    prev: i > 0 ? ref(ordered[i - 1]) : null,
    next: i >= 0 ? ref(ordered[i + 1]) : null,
  };
}
