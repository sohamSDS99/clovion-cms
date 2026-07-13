"use client";

/**
 * Course manager — one course. An accordion of lessons ordered by
 * lessonNumber: drag the ⠿ handle to reorder (HTML5 drag & drop, persisted
 * via POST reorder), click a row to expand its excerpt / key learnings /
 * downloads. Lifecycle stays in the editor — the only per-lesson action here
 * is "Open in editor".
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader, PageBody } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Field";
import { Loading, InlineError, EmptyState } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/ui/client";
import type { CourseDetail, CourseLesson } from "@/lib/content/courseManager";

export function CourseManager({ courseSlug }: { courseSlug: string }) {
  const toast = useToast();
  const router = useRouter();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [lessons, setLessons] = useState<CourseLesson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  // "+ Add lesson" modal
  const [addOpen, setAddOpen] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({});
  const [authors, setAuthors] = useState<{ id: string; displayName: string }[]>([]);
  const [settingAuthor, setSettingAuthor] = useState(false);
  const [assetsGenerating, setAssetsGenerating] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [brief, setBrief] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: CourseDetail }>(
        `/api/content/courses/${courseSlug}`
      );
      setCourse(res.data);
      setLessons(res.data.lessons);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [courseSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api
      .get<{ profiles: { id: string; displayName: string }[] }>("/api/author-profiles")
      .then((r) => setAuthors(r.profiles))
      .catch(() => {});
  }, []);

  // While assets generate in the background, keep the lesson list fresh so
  // downloads appear as they land.
  useEffect(() => {
    if (!assetsGenerating) return;
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, [assetsGenerating, load]);

  /** Persist the given order; on failure reload the server truth. */
  async function persistOrder(next: CourseLesson[]) {
    setReordering(true);
    try {
      await api.post(`/api/content/courses/${courseSlug}/reorder`, {
        orderedIds: next.map((l) => l.id),
      });
      toast.success("Lesson order saved.");
      setLessons(next.map((l, i) => ({ ...l, lessonNumber: i + 1 })));
    } catch (err) {
      toast.error(errorMessage(err));
      await load();
    } finally {
      setReordering(false);
    }
  }

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const from = lessons.findIndex((l) => l.id === draggingId);
    const to = lessons.findIndex((l) => l.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...lessons];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setLessons(next.map((l, i) => ({ ...l, lessonNumber: i + 1 })));
    void persistOrder(next);
  }

  async function addManualLesson() {
    setAddBusy(true);
    try {
      const res = await api.post<{ data: { id: string } }>(
        `/api/content/courses/${courseSlug}/lessons`
      );
      toast.success("Lesson created.");
      router.push(`/content/${res.data.id}/edit`);
    } catch (err) {
      toast.error(errorMessage(err));
      setAddBusy(false);
    }
  }

  async function generateLesson() {
    setAddBusy(true);
    try {
      const res = await api.post<{ data: { id: string } }>(
        "/api/content-agent/runs",
        {
          channel: "BLOG_ARTICLE",
          postType: "course-lesson",
          brief,
          targetCourseSlug: courseSlug,
        }
      );
      toast.success("Lesson generation started.");
      router.push(`/content-agent/${res.data.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setAddBusy(false);
    }
  }

  function courseStatus(status: string): { tone: "draft" | "review" | "published" | "neutral"; label: string } {
    if (status === "DRAFT") return { tone: "draft", label: "Draft" };
    if (status === "IN_REVIEW") return { tone: "review", label: "Approved" };
    if (status === "PUBLISHED") return { tone: "published", label: "Published" };
    return { tone: "neutral", label: status };
  }

  async function generateAssets() {
    try {
      await api.post(`/api/content/courses/${courseSlug}/generate-assets`);
      setAssetsGenerating(true);
      toast.success("Asset generation started.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function changeAuthor(authorProfileId: string) {
    if (!authorProfileId) return;
    setSettingAuthor(true);
    try {
      await api.post(`/api/content/courses/${courseSlug}/author`, { authorProfileId });
      toast.success("Author set on every lesson.");
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSettingAuthor(false);
    }
  }

  async function approveOne(id: string) {
    setApprovingId(id);
    try {
      await api.post(`/api/content/courses/${courseSlug}/approve`, { ids: [id] });
      toast.success("Lesson approved.");
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setApprovingId(null);
    }
  }

  async function approveAll() {
    setApprovingAll(true);
    try {
      const res = await api.post<{ data: { approved: number } }>(
        `/api/content/courses/${courseSlug}/approve`
      );
      toast.success(`Approved ${res.data.approved} lesson(s).`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setApprovingAll(false);
    }
  }

  async function publishAll() {
    if (!window.confirm("Publish this course? Approved lessons go live on the website.")) return;
    setPublishing(true);
    try {
      const res = await api.post<{
        data: { published: number; skipped: number; failed: { id: string; error: string }[] };
      }>(`/api/content/courses/${courseSlug}/publish`);
      if (res.data.failed.length > 0) {
        setPublishErrors(
          Object.fromEntries(res.data.failed.map((f) => [f.id, f.error]))
        );
        toast.error(
          res.data.published === 0
            ? `Nothing published — ${res.data.failed.length} lesson(s) blocked: ${res.data.failed[0].error}`
            : `${res.data.published} published, ${res.data.failed.length} failed: ${res.data.failed[0].error}`
        );
      } else {
        setPublishErrors({});
        toast.success(`Published ${res.data.published} lesson(s). The course is live.`);
      }
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPublishing(false);
    }
  }

  if (error) {
    return (
      <PageBody>
        <InlineError message={error} />
      </PageBody>
    );
  }
  if (!course) return <Loading label="Loading course…" />;

  return (
    <>
      <PageHeader
        title={course.courseTitle}
        description={`${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"} — drag ⠿ to reorder; lifecycle lives in the editor.`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/course-manager"
              className="text-sm text-ink-mute underline-offset-2 hover:text-ink hover:underline"
            >
              All courses
            </Link>
            <Button size="sm" variant="ghost" onClick={generateAssets}>
              Generate assets
            </Button>
            <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
              + Add lesson
            </Button>
            {lessons.some((l) => l.status === "DRAFT") ? (
              <Button size="sm" variant="secondary" loading={approvingAll} onClick={approveAll}>
                Approve all
              </Button>
            ) : null}
            {lessons.length > 0 && lessons.every((l) => l.status !== "DRAFT") &&
            lessons.some((l) => l.status !== "PUBLISHED") ? (
              <Button size="sm" variant="primary" loading={publishing} onClick={publishAll}>
                Publish course
              </Button>
            ) : null}
          </div>
        }
      />
      <PageBody>
        {assetsGenerating ? (
          <div className="mb-4 flex items-center justify-between rounded border border-line bg-paper-sunken px-3 py-2 text-sm text-ink-soft">
            <span>
              Generating assets in the background — downloads appear on each
              lesson as they finish ({lessons.reduce((n, l) => n + l.downloads.length, 0)}{" "}
              attached so far).
            </span>
            <button
              className="text-xs text-ink-mute underline-offset-2 hover:underline"
              onClick={() => setAssetsGenerating(false)}
            >
              dismiss
            </button>
          </div>
        ) : null}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-ink-mute">Author</span>
          <select
            className="rounded border border-line bg-paper px-2 py-1.5 text-sm text-ink"
            value={course.courseAuthorId ?? ""}
            disabled={settingAuthor}
            onChange={(e) => void changeAuthor(e.target.value)}
          >
            {course.courseAuthorId === null ? (
              <option value="">Mixed / choose…</option>
            ) : null}
            {authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </select>
          <span className="text-xs text-ink-faint">
            Applies to all lessons — per-lesson override lives in the editor&apos;s Details tab.
          </span>
        </div>
        {lessons.length === 0 ? (
          <EmptyState title="No lessons in this course" />
        ) : (
          <ul className="divide-y divide-line rounded border border-line bg-paper-raised shadow-card">
            {lessons.map((lesson) => {
              const expanded = expandedId === lesson.id;
              const status = courseStatus(lesson.status);
              return (
                <li
                  key={lesson.id}
                  onDragOver={(e) => {
                    if (draggingId) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(lesson.id);
                  }}
                  className={draggingId === lesson.id ? "opacity-50" : undefined}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setExpandedId((cur) => (cur === lesson.id ? null : lesson.id))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedId((cur) =>
                          cur === lesson.id ? null : lesson.id
                        );
                      }
                    }}
                    aria-expanded={expanded}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-paper-sunken"
                  >
                    <span
                      draggable={!reordering}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", lesson.id);
                        setDraggingId(lesson.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Drag to reorder "${lesson.title}"`}
                      title="Drag to reorder"
                      className="cursor-grab select-none text-ink-faint hover:text-ink active:cursor-grabbing"
                    >
                      ⠿
                    </span>
                    <span className="w-6 shrink-0 text-right text-sm tabular-nums text-ink-faint">
                      {lesson.lessonNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {lesson.title}
                    </span>
                    {publishErrors[lesson.id] ? (
                      <span className="max-w-xs truncate text-xs text-ink-soft" title={publishErrors[lesson.id]}>
                        ⚠ {publishErrors[lesson.id]}
                      </span>
                    ) : null}
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {lesson.status === "DRAFT" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={approvingId === lesson.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void approveOne(lesson.id);
                        }}
                      >
                        Approve
                      </Button>
                    ) : null}
                  </div>

                  {expanded ? (
                    <div className="flex flex-col gap-4 border-t border-line bg-paper-sunken/50 px-4 py-4 pl-14">
                      {lesson.excerpt ? (
                        <p className="text-sm text-ink-soft">{lesson.excerpt}</p>
                      ) : null}
                      {lesson.publishIssues.length > 0 ? (
                        <div className="rounded border border-line bg-paper-sunken px-3 py-2 text-xs text-ink-soft">
                          <span className="font-medium">Blocks publishing:</span>{" "}
                          {lesson.publishIssues.join(" · ")}
                        </div>
                      ) : null}

                      {lesson.keyLearnings.length > 0 ? (
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
                            Key learnings
                          </p>
                          <ul className="list-disc pl-5 text-sm text-ink-soft">
                            {lesson.keyLearnings.map((k, i) => (
                              <li key={i}>{k}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {lesson.downloads.length > 0 ? (
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
                            Downloads
                          </p>
                          <ul className="flex flex-col gap-1 text-sm">
                            {lesson.downloads.map((d) => (
                              <li key={d.mediaAssetId}>
                                {d.url ? (
                                  <a
                                    href={d.url}
                                    download
                                    className="text-accent underline underline-offset-2"
                                  >
                                    {d.filename ?? d.label}
                                  </a>
                                ) : (
                                  <span className="text-ink-mute">{d.label}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div>
                        <Link href={`/content/${lesson.id}/edit`}>
                          <Button size="sm" variant="secondary">
                            Open in editor
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>

      <Modal
        open={addOpen}
        onClose={() => {
          if (!addBusy) {
            setAddOpen(false);
            setBrief("");
          }
        }}
        title="Add a lesson"
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Write manually</p>
              <p className="mt-0.5 text-xs text-ink-mute">
                An empty draft at the end of the course, opened in the editor.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={addManualLesson}
              loading={addBusy}
            >
              Write manually
            </Button>
          </div>

          <div className="border-t border-line pt-4">
            <p className="text-sm font-medium text-ink">
              Generate with Content Agent
            </p>
            <p className="mt-0.5 text-xs text-ink-mute">
              The writer gets the course&apos;s existing lessons for continuity.
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <Textarea
                rows={4}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="What should this lesson teach? The question it answers, key points, data to include…"
              />
              <div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={generateLesson}
                  loading={addBusy}
                  disabled={brief.trim().length < 10}
                >
                  Generate
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
