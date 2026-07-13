import { CourseManager } from "@/components/courses/CourseManager";

/** One course: ordered, reorderable lessons with per-lesson detail. */
export default async function CourseManagerDetailPage({
  params,
}: {
  params: Promise<{ courseSlug: string }>;
}) {
  const { courseSlug } = await params;
  return <CourseManager courseSlug={courseSlug} />;
}
