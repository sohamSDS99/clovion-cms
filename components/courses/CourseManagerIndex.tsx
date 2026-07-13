"use client";

/**
 * Course manager index — one card per course (COURSE lessons grouped by
 * courseSlug), linking into the per-course manager.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, PageBody } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Loading, InlineError, EmptyState } from "@/components/ui/Feedback";
import { api, errorMessage } from "@/lib/ui/client";
import type { CourseSummary } from "@/lib/content/courseManager";

export function CourseManagerIndex() {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: CourseSummary[] }>("/api/content/courses")
      .then((res) => setCourses(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <>
      <PageHeader
        title="Course Manager"
        description="Every course in the CMS — lessons grouped, ordered and managed in one place."
      />
      <PageBody>
        {error ? (
          <InlineError message={error} />
        ) : !courses ? (
          <Loading label="Loading courses…" />
        ) : courses.length === 0 ? (
          <EmptyState
            title="No courses yet"
            description="Generate a course with the Content Agent (course outline → generate course → send to CMS) and it will show up here."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <Link
                key={course.courseSlug}
                href={`/course-manager/${course.courseSlug}`}
                className="group"
              >
                <Card className="h-full p-5 transition-colors group-hover:border-line-strong">
                  <h3 className="font-display text-base font-semibold text-ink">
                    {course.courseTitle}
                  </h3>
                  <p className="mt-1 text-sm text-ink-mute">
                    {course.lessonCount}{" "}
                    {course.lessonCount === 1 ? "lesson" : "lessons"} ·{" "}
                    {course.assetCount}{" "}
                    {course.assetCount === 1 ? "asset" : "assets"} ·{" "}
                    {course.publishedCount} published · {course.draftCount}{" "}
                    draft{course.draftCount === 1 ? "" : "s"}
                  </p>
                  <p className="mt-3 text-xs text-ink-faint">
                    Updated {new Date(course.updatedAt).toLocaleDateString()}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
