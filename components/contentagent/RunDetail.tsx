"use client";

/**
 * Content Agent — run detail: pipeline progress, QA verdict, separately
 * editable Content + Caption, design-prompt export, feedback loop, delete.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AgentRun } from "@prisma/client";
import { PageHeader, PageBody } from "@/components/shell/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Field";
import { Loading, InlineError, Spinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/ui/client";
import { slugFromTitle } from "@/lib/ui/format";
import { CHANNELS } from "@/lib/contentagent/channels";
import { buildDesignPrompt } from "@/lib/contentagent/designPrompt";
import { parseImagesBlock, buildImageDesignPrompt } from "@/lib/contentagent/images";
import {
  ACTIVE_STATUSES,
  PIPELINE_STAGES,
  runStatusLabel,
  runStatusTone,
} from "./runStatus";

interface QaReport {
  pass: boolean;
  scores?: Record<string, number>;
  requiredFixes?: string[];
  notes?: string;
}

const SCORE_LABELS: Record<string, string> = {
  leadsWithAnswer: "Leads with the answer",
  calm: "Calm, no FOMO",
  specific: "A competitor couldn't say it",
  numbersBacked: "Numbers where possible",
  clarity: "Read once, understood",
  soundsHuman: "Sounds like a person",
};

export function RunDetail({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [specText, setSpecText] = useState("");
  const [caption, setCaption] = useState("");
  const dirty = useRef({ content: false, spec: false, caption: false });
  const [saving, setSaving] = useState<"content" | "spec" | "caption" | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [filing, setFiling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [batch, setBatch] = useState<{
    batch: { status: string; currentLesson: number; courseTitle: string | null; error: unknown; syllabus: unknown };
    lessons: { id: string; status: string; brief: string; contentId: string | null }[];
    assetSummary?: { ready: number; generating: number; failed: number };
  } | null>(null);
  const [startingCourse, setStartingCourse] = useState(false);
  const [generatingAssets, setGeneratingAssets] = useState(false);
  const [syllabusLessons, setSyllabusLessons] = useState<
    { title: string; brief: string; assets?: unknown[] }[] | null
  >(null);
  const [syllabusTitle, setSyllabusTitle] = useState("");
  const syllabusDirty = useRef(false);
  const [savingSyllabus, setSavingSyllabus] = useState(false);
  const [expandingIdx, setExpandingIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [sendingCourse, setSendingCourse] = useState(false);
  const [assets, setAssets] = useState<
    { id: string; filename: string | null; kind: string; status: string; url: string | null }[]
  >([]);
  const [tab, setTab] = useState<"draft" | "images">("draft");

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: AgentRun }>(`/api/content-agent/runs/${id}`);
      setRun(res.data);
      if (!dirty.current.content) setContent(res.data.draftText ?? "");
      if (!dirty.current.spec) setSpecText(res.data.specText ?? "");
      if (!dirty.current.caption) setCaption(res.data.captionText ?? "");
      const syl = (res.data as { outlineSyllabus?: { courseTitle?: string; lessons?: { title: string; brief: string; assets?: unknown[] }[] } }).outlineSyllabus;
      if (syl && !syllabusDirty.current) {
        setSyllabusTitle(syl.courseTitle ?? "");
        setSyllabusLessons(syl.lessons ?? []);
      }
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOutline = run?.postType === "course-outline";
  const isLesson = run?.postType === "course-lesson";

  const loadBatch = useCallback(async () => {
    if (!isOutline) return;
    try {
      const res = await api.get<{ data: typeof batch }>(
        `/api/content-agent/runs/${id}/course-batch`
      );
      setBatch(res.data);
    } catch {
      /* no batch yet */
    }
  }, [id, isOutline]);

  const loadAssets = useCallback(async () => {
    if (!isLesson) return;
    try {
      const res = await api.get<{ data: typeof assets }>(
        `/api/content-agent/runs/${id}/assets`
      );
      setAssets(res.data);
    } catch {
      /* none */
    }
  }, [id, isLesson]);

  useEffect(() => {
    void loadBatch();
    void loadAssets();
  }, [loadBatch, loadAssets]);

  const batchActive =
    (batch?.batch && ["PLANNING", "RUNNING"].includes(batch.batch.status)) ||
    (batch?.assetSummary?.generating ?? 0) > 0;
  useEffect(() => {
    if (!batchActive) return;
    const t = setInterval(() => void loadBatch(), 4000);
    return () => clearInterval(t);
  }, [batchActive, loadBatch]);

  useEffect(() => {
    const generating = assets.some((a) => ["PENDING", "GENERATING"].includes(a.status));
    if (!generating) return;
    const t = setInterval(() => void loadAssets(), 4000);
    return () => clearInterval(t);
  }, [assets, loadAssets]);

  async function saveSyllabus(lessons?: { title: string; brief: string; assets?: unknown[] }[]) {
    setSavingSyllabus(true);
    try {
      const res = await api.put<{ data: AgentRun }>(`/api/content-agent/runs/${id}/syllabus`, {
        courseTitle: syllabusTitle || "Untitled course",
        lessons: (lessons ?? syllabusLessons ?? []).map((l) => ({
          title: l.title,
          brief: l.brief,
          assets: l.assets,
        })),
      });
      setRun(res.data);
      syllabusDirty.current = false;
      toast.success("Lesson plan saved.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingSyllabus(false);
    }
  }

  async function expandLesson(index: number) {
    // Persist first so the server expands the saved title.
    await saveSyllabus();
    setExpandingIdx(index);
    try {
      const res = await api.post<{ data: AgentRun }>(
        `/api/content-agent/runs/${id}/syllabus/expand`,
        { index }
      );
      const syl = (res.data as { outlineSyllabus?: { lessons?: { title: string; brief: string }[] } }).outlineSyllabus;
      if (syl?.lessons) setSyllabusLessons(syl.lessons);
      toast.success("Summary generated.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExpandingIdx(null);
    }
  }

  async function generateAssets() {
    setGeneratingAssets(true);
    try {
      await api.post(`/api/content-agent/runs/${id}/generate-assets`);
      toast.success("Generating course assets — check each lesson's Downloads card in a few minutes.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setGeneratingAssets(false);
    }
  }

  async function startCourse() {
    setStartingCourse(true);
    try {
      await api.post(`/api/content-agent/runs/${id}/generate-course`);
      toast.success("Course generation started.");
      await loadBatch();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setStartingCourse(false);
    }
  }

  /** File the whole READY course batch into the CMS (resumable). */
  async function sendCourse() {
    setSendingCourse(true);
    try {
      const res = await api.post<{
        data: { courseSlug: string; filed: number; skipped: number };
      }>(`/api/content-agent/runs/${id}/send-course`);
      toast.success(
        `Filed ${res.data.filed} lesson${res.data.filed === 1 ? "" : "s"} to the CMS` +
          (res.data.skipped > 0 ? ` (${res.data.skipped} already filed).` : ".")
      );
      await loadBatch();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSendingCourse(false);
    }
  }

  /** File this lesson run into its target course at the next lesson number. */
  async function addToCourse() {
    setFiling(true);
    try {
      const res = await api.post<{ data: { contentId: string; run: AgentRun } }>(
        `/api/content-agent/runs/${id}/add-to-course`
      );
      setRun(res.data.run);
      toast.success("Lesson added to the course as a draft.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setFiling(false);
    }
  }

  const isActive = run ? (ACTIVE_STATUSES as string[]).includes(run.status) : false;

  useEffect(() => {
    if (!isActive) return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [isActive, load]);

  const spec = useMemo(
    () => (run ? CHANNELS.find((c) => c.id === run.channel) : undefined),
    [run]
  );
  const qa = (run?.qaReport ?? null) as QaReport | null;

  async function copyText(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied.`);
    } catch {
      toast.error("Couldn't access the clipboard — select and copy manually.");
    }
  }

  /** Copy HTML as rich text so pasting into an editor keeps headings/bold. */
  async function copyRich(html: string, what: string) {
    try {
      const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      toast.success(`${what} copied with formatting.`);
    } catch {
      // Older browsers: fall back to plain HTML source.
      await copyText(html, what);
    }
  }

  async function save(field: "content" | "spec" | "caption") {
    setSaving(field);
    try {
      const body =
        field === "content"
          ? { draftText: content }
          : field === "spec"
            ? { specText }
            : { captionText: caption };
      const res = await api.patch<{ data: AgentRun }>(
        `/api/content-agent/runs/${id}`,
        body
      );
      setRun(res.data);
      dirty.current[field] = false;
      toast.success("Saved.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  async function sendFeedback() {
    setSendingFeedback(true);
    try {
      const res = await api.post<{ data: AgentRun }>(
        `/api/content-agent/runs/${id}/feedback`,
        { note: feedbackNote }
      );
      setRun(res.data);
      setFeedbackNote("");
      dirty.current = { content: false, spec: false, caption: false };
      toast.success("Feedback sent — revising now.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSendingFeedback(false);
    }
  }

  async function fileToCms() {
    setFiling(true);
    try {
      const res = await api.post<{ data: { contentId: string; run: AgentRun } }>(
        `/api/content-agent/runs/${id}/send-to-blog`
      );
      setRun(res.data.run);
      toast.success("Filed as a draft.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setFiling(false);
    }
  }

  async function approve() {
    setApproving(true);
    try {
      const res = await api.post<{ data: AgentRun }>(
        `/api/content-agent/runs/${id}/approve`
      );
      setRun(res.data);
      toast.success("Approved — the agents will learn from your edits.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setApproving(false);
    }
  }

  async function stopRun() {
    setStopping(true);
    try {
      const res = await api.post<{ data: AgentRun }>(`/api/content-agent/runs/${id}/cancel`);
      setRun(res.data);
      toast.success("Stopped — the current step finishes, then nothing else runs.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setStopping(false);
    }
  }

  async function removeRun() {
    if (!window.confirm("Delete this run permanently?")) return;
    setDeleting(true);
    try {
      await api.delete(`/api/content-agent/runs/${id}`);
      toast.success("Run deleted.");
      router.push("/content-agent");
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <PageBody>
        <InlineError message={error} />
      </PageBody>
    );
  }
  if (!run) return <Loading label="Loading run…" />;

  const failedMessage = (run.error as { message?: string } | null)?.message;
  const isArticle = spec?.format === "article" && Boolean(spec?.cmsType);
  const fileLabel =
    spec?.cmsType === "RESOURCE" ? "Send to resources" : "Send to blog drafts";
  const hasCaptionField = run.captionText !== null || dirty.current.caption;
  const hasSpecField = (run.specText !== null || dirty.current.spec) && !isArticle;
  const contentLabel = isArticle
    ? "Article (HTML)"
    : run.format === "infographic" || run.format === "carousel"
      ? "Content"
      : "Caption";
  const specLabel = run.format === "carousel" ? "Slides" : "Graphic spec";
  const showDesignCopy =
    (run.format === "infographic" || run.format === "carousel") &&
    run.status === "READY";
  const editable = run.status === "READY";
  const ready = run.status === "READY";
  const imageEntries = isArticle ? parseImagesBlock(run.specText) : [];
  const hasImagesTab = imageEntries.length > 0;

  return (
    <>
      <PageHeader
        title={spec?.label ?? run.channel}
        description={run.brief}
        actions={
          <div className="flex items-center gap-2">
            {run.approvedAt ? (
              <Badge tone="published">Approved</Badge>
            ) : (
              <Badge tone={runStatusTone(run.status)}>{runStatusLabel(run.status)}</Badge>
            )}
            {isActive ? (
              <Button size="sm" variant="secondary" onClick={stopRun} loading={stopping}>
                Stop
              </Button>
            ) : null}
            {ready && !run.approvedAt ? (
              <Button size="sm" onClick={approve} loading={approving}>
                Approve
              </Button>
            ) : null}
            {ready || run.status === "FAILED" || run.status === "CANCELLED" ? (
              <Button variant="ghost" size="sm" onClick={removeRun} loading={deleting}>
                Delete
              </Button>
            ) : null}
          </div>
        }
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 flex flex-col gap-6">
            {hasImagesTab ? (
              <div className="flex gap-1 border-b border-line">
                {(["draft", "images"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={
                      "px-3 py-2 text-sm " +
                      (tab === t
                        ? "border-b-2 border-ink font-medium text-ink"
                        : "text-ink-mute hover:text-ink")
                    }
                  >
                    {t === "draft" ? "Draft" : `Images (${imageEntries.length})`}
                  </button>
                ))}
              </div>
            ) : null}

            {hasImagesTab && tab === "images" ? (
              <>
                {imageEntries.map((img) => (
                  <Card key={img.n}>
                    <CardHeader
                      title={`${img.isCover ? "Cover image" : `Image ${img.n}`} — ${img.type === "screenshot" ? "product screenshot" : img.type === "design" ? "designed diagram" : "image"} · ${img.size.replace("x", "×")}`}
                      action={
                        img.type === "design" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => copyText(buildImageDesignPrompt(img), `Image ${img.n} design prompt`)}
                          >
                            Copy for Claude design
                          </Button>
                        ) : null
                      }
                    />
                    <div className="flex flex-col gap-2 p-4 pt-0 text-sm">
                      <p className="text-ink">{img.shows}</p>
                      {img.type === "screenshot" ? (
                        <p className="rounded border border-line bg-paper-sunken px-3 py-2 text-ink-soft">
                          Product screenshot needed — no design prompt.{" "}
                          {img.capture ? `Capture: ${img.capture}` : ""}
                        </p>
                      ) : img.brief ? (
                        <p className="whitespace-pre-wrap text-ink-soft">{img.brief}</p>
                      ) : null}
                      <p className="text-xs text-ink-faint">
                        {img.placement
                          ? `Placement: ${img.placement}`
                          : "Placement: see the article section this image belongs to."}
                      </p>
                    </div>
                  </Card>
                ))}
              </>
            ) : null}

            <div className={hasImagesTab && tab === "images" ? "hidden" : "contents"}>
            {isActive ? (
              <Card>
                <CardHeader title="The agents are working" />
                <ul className="flex flex-col gap-2 p-4 pt-0">
                  {PIPELINE_STAGES.map((stage) => {
                    const reached =
                      PIPELINE_STAGES.findIndex((s) => s.key === run.status) >=
                      PIPELINE_STAGES.findIndex((s) => s.key === stage.key);
                    const current = run.status === stage.key;
                    return (
                      <li key={stage.key} className="flex items-center gap-2 text-sm">
                        {current ? (
                          <Spinner className="h-4 w-4" />
                        ) : (
                          <span className={reached ? "text-ink" : "text-ink-faint"}>
                            {reached ? "✓" : "·"}
                          </span>
                        )}
                        <span className={current ? "text-ink" : "text-ink-mute"}>
                          {stage.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}

            {run.status === "FAILED" ? (
              <Card>
                <CardHeader title="Run failed" />
                <div className="p-4 pt-0">
                  <InlineError message={failedMessage ?? "Unknown error."} />
                </div>
              </Card>
            ) : null}

            {/* Content */}
            {run.draftText ? (
              <Card>
                <CardHeader
                  title={contentLabel}
                  action={
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          isArticle
                            ? copyRich(content, contentLabel)
                            : copyText(content, contentLabel)
                        }
                      >
                        Copy
                      </Button>
                      {isArticle ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyText(content, "HTML source")}
                        >
                          Copy HTML
                        </Button>
                      ) : null}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => save("content")}
                        loading={saving === "content"}
                        disabled={!editable}
                      >
                        Save
                      </Button>
                      {isArticle ? (
                        run.contentId ? (
                          run.targetCourseSlug ? (
                            <Link
                              href={`/course-manager/${run.targetCourseSlug}`}
                              className="text-sm text-accent underline underline-offset-2"
                            >
                              Open course manager
                            </Link>
                          ) : (
                            <Link
                              href={`/content/${run.contentId}`}
                              className="text-sm text-accent underline underline-offset-2"
                            >
                              Open CMS draft
                            </Link>
                          )
                        ) : run.targetCourseSlug ? (
                          <Button size="sm" onClick={addToCourse} loading={filing} disabled={!ready}>
                            Add to course
                          </Button>
                        ) : (
                          <Button size="sm" onClick={fileToCms} loading={filing} disabled={!ready}>
                            {fileLabel}
                          </Button>
                        )
                      ) : null}
                    </div>
                  }
                />
                <div className="p-4 pt-0">
                  <Textarea
                    rows={isArticle ? 24 : 16}
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      dirty.current.content = true;
                    }}
                    disabled={!editable}
                    className="font-mono text-sm"
                  />
                </div>
              </Card>
            ) : null}

            {/* Graphic/slide spec (infographic & carousel runs) */}
            {hasSpecField ? (
              <Card>
                <CardHeader
                  title={specLabel}
                  action={
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => copyText(specText, specLabel)}
                      >
                        Copy
                      </Button>
                      {showDesignCopy ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            copyText(
                              buildDesignPrompt({ ...run, specText }),
                              "Design prompt"
                            )
                          }
                        >
                          Copy for Claude design
                        </Button>
                      ) : null}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => save("spec")}
                        loading={saving === "spec"}
                        disabled={!editable}
                      >
                        Save
                      </Button>
                    </div>
                  }
                />
                <div className="p-4 pt-0">
                  <Textarea
                    rows={14}
                    value={specText}
                    onChange={(e) => {
                      setSpecText(e.target.value);
                      dirty.current.spec = true;
                    }}
                    disabled={!editable}
                    className="font-mono text-sm"
                  />
                </div>
              </Card>
            ) : null}

            {/* Caption (separate deliverable for infographic/carousel runs) */}
            {hasCaptionField ? (
              <Card>
                <CardHeader
                  title="Caption"
                  action={
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => copyText(caption, "Caption")}
                      >
                        Copy
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => save("caption")}
                        loading={saving === "caption"}
                        disabled={!editable}
                      >
                        Save
                      </Button>
                    </div>
                  }
                />
                <div className="p-4 pt-0">
                  <Textarea
                    rows={5}
                    value={caption}
                    onChange={(e) => {
                      setCaption(e.target.value);
                      dirty.current.caption = true;
                    }}
                    disabled={!editable}
                  />
                </div>
              </Card>
            ) : null}

            {/* Lesson plan (outline runs) — editable before generating */}
            {isOutline && ready && syllabusLessons ? (
              <Card>
                <CardHeader
                  title="Lesson plan"
                  subtitle="What the course will generate — edit titles, add, remove, or drag to reorder before you approve."
                  action={
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSyllabusLessons((prev) => [...(prev ?? []), { title: "", brief: "" }]);
                          syllabusDirty.current = true;
                        }}
                        disabled={(syllabusLessons?.length ?? 0) >= 10}
                      >
                        + Add lesson
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveSyllabus()}
                        loading={savingSyllabus}
                      >
                        Save plan
                      </Button>
                    </div>
                  }
                />
                <ul className="divide-y divide-line p-4 pt-0">
                  {syllabusLessons.map((l, i) => (
                    <li
                      key={i}
                      className="flex gap-2 py-3"
                      draggable
                      onDragStart={() => setDragIdx(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIdx === null || dragIdx === i) return;
                        setSyllabusLessons((prev) => {
                          if (!prev) return prev;
                          const next = [...prev];
                          const [moved] = next.splice(dragIdx, 1);
                          next.splice(i, 0, moved);
                          return next;
                        });
                        syllabusDirty.current = true;
                        setDragIdx(null);
                      }}
                    >
                      <span className="cursor-grab pt-2 text-ink-faint" title="Drag to reorder">⠿</span>
                      <span className="pt-2 text-sm tabular-nums text-ink-mute">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <input
                          className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm font-medium text-ink"
                          placeholder="Lesson title…"
                          value={l.title}
                          onChange={(e) => {
                            setSyllabusLessons((prev) => {
                              if (!prev) return prev;
                              const next = [...prev];
                              next[i] = { ...next[i], title: e.target.value };
                              return next;
                            });
                            syllabusDirty.current = true;
                          }}
                        />
                        {l.brief ? (
                          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{l.brief}</p>
                        ) : (
                          <p className="mt-1.5 text-xs italic text-ink-faint">
                            No summary yet — write the title, then generate what it covers.
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={expandingIdx === i}
                          disabled={!l.title.trim()}
                          onClick={() => void expandLesson(i)}
                        >
                          {l.brief ? "Regenerate summary" : "Generate summary"}
                        </Button>
                        <button
                          aria-label="Remove lesson"
                          className="px-2 text-xs text-ink-mute hover:text-ink"
                          onClick={() => {
                            setSyllabusLessons((prev) => prev?.filter((_, j) => j !== i) ?? prev);
                            syllabusDirty.current = true;
                          }}
                        >
                          ✕ remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {/* Course generation (outline runs) */}
            {isOutline && ready ? (
              <Card>
                <CardHeader
                  title="Course generation"
                  subtitle={
                    run.approvedAt
                      ? "One click: lessons generate in sequence, each fed the outline and all prior lessons; templates are created per lesson."
                      : "Approve the outline first — every lesson inherits it."
                  }
                  action={
                    !batch?.batch || batch.batch.status === "FAILED" ? (
                      <Button
                        size="sm"
                        onClick={startCourse}
                        loading={startingCourse}
                        disabled={!run.approvedAt}
                      >
                        {batch?.batch?.status === "FAILED" ? "Resume course" : "Generate course"}
                      </Button>
                    ) : batch.batch.status === "READY" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={generateAssets}
                        loading={generatingAssets}
                      >
                        Generate assets
                      </Button>
                    ) : null
                  }
                />
                {batch?.batch ? (
                  <div className="flex flex-col gap-2 p-4 pt-0 text-sm">
                    <p className="text-ink-mute">
                      {batch.batch.courseTitle ?? "Course"} —{" "}
                      {batch.batch.status === "RUNNING"
                        ? `writing lesson ${batch.batch.currentLesson + 1}…`
                        : batch.batch.status.toLowerCase()}
                    </p>
                    {batch.assetSummary &&
                    (batch.assetSummary.ready > 0 ||
                      batch.assetSummary.generating > 0 ||
                      batch.assetSummary.failed > 0) ? (
                      <p className="text-xs text-ink-soft">
                        Assets: {batch.assetSummary.ready} ready
                        {batch.assetSummary.generating > 0
                          ? ` · ${batch.assetSummary.generating} generating…`
                          : ""}
                        {batch.assetSummary.failed > 0
                          ? ` · ${batch.assetSummary.failed} failed`
                          : ""}
                      </p>
                    ) : null}
                    {(batch.batch.error as { message?: string } | null)?.message ? (
                      <InlineError
                        message={(batch.batch.error as { message: string }).message}
                      />
                    ) : null}
                    <ul className="divide-y divide-line">
                      {batch.lessons.map((l, i) => (
                        <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                          <Link
                            href={`/content-agent/${l.id}`}
                            className="min-w-0 truncate text-ink underline-offset-2 hover:underline"
                          >
                            {i + 1}. {l.brief.slice(0, 90)}
                          </Link>
                          <span className="flex shrink-0 items-center gap-2">
                            {l.contentId ? <Badge tone="published">Filed</Badge> : null}
                            <Badge tone={runStatusTone(l.status as never)}>
                              {runStatusLabel(l.status as never)}
                            </Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                    {batch.batch.status === "READY" ? (
                      <div className="flex items-center gap-3 border-t border-line pt-3">
                        {batch.lessons.every((l) => l.contentId) ? (
                          <Badge tone="published">All lessons filed</Badge>
                        ) : (
                          <Button size="sm" onClick={sendCourse} loading={sendingCourse}>
                            Send course to CMS
                          </Button>
                        )}
                        {batch.lessons.some((l) => l.contentId) && batch.batch.courseTitle ? (
                          <Link
                            href={`/course-manager/${slugFromTitle(batch.batch.courseTitle)}`}
                            className="text-sm text-accent underline underline-offset-2"
                          >
                            Open course manager
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            ) : null}

            {/* Generated files (lesson runs) */}
            {isLesson && assets.length > 0 ? (
              <Card>
                <CardHeader title="Downloads" subtitle="Generated templates for this lesson." />
                <ul className="divide-y divide-line p-4 pt-0 text-sm">
                  {assets.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0 truncate text-ink">
                        {a.filename ?? a.kind}
                        <span className="ml-2 text-xs uppercase text-ink-faint">{a.kind}</span>
                      </span>
                      {a.status === "READY" && a.url ? (
                        <a
                          href={a.url}
                          download
                          className="text-accent underline underline-offset-2"
                        >
                          Download
                        </a>
                      ) : a.status === "FAILED" ? (
                        <span className="text-xs text-ink-faint">failed</span>
                      ) : (
                        <Spinner className="h-4 w-4" />
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {/* Feedback */}
            {ready || run.status === "FAILED" ? (
              <Card>
                <CardHeader
                  title="Give feedback"
                  subtitle="The writer revises with your note, then QA re-checks it."
                />
                <div className="flex flex-col gap-3 p-4 pt-0">
                  <Textarea
                    rows={3}
                    value={feedbackNote}
                    onChange={(e) => setFeedbackNote(e.target.value)}
                    placeholder="e.g. Lead with the 67% stat, drop the second example, make the ending a question…"
                  />
                  <div>
                    <Button
                      variant="secondary"
                      onClick={sendFeedback}
                      loading={sendingFeedback}
                      disabled={feedbackNote.trim().length < 3 || !run.draftText}
                    >
                      Revise with feedback
                    </Button>
                  </div>
                </div>
              </Card>
            ) : null}
            </div>
          </div>

          {/* QA sidebar */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {qa ? (
              <Card>
                <CardHeader
                  title="QA verdict"
                  action={
                    <Badge tone={qa.pass ? "published" : "review"}>
                      {qa.pass ? "Passed" : "Flagged"}
                    </Badge>
                  }
                />
                <div className="flex flex-col gap-3 p-4 pt-0">
                  {qa.scores ? (
                    <ul className="flex flex-col gap-1.5">
                      {Object.entries(qa.scores).map(([key, score]) => (
                        <li key={key} className="flex items-center justify-between text-sm">
                          <span className="text-ink-mute">{SCORE_LABELS[key] ?? key}</span>
                          <span className="tabular-nums text-ink">{score}/5</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {qa.notes ? (
                    <p className="border-t border-line pt-3 text-sm text-ink-soft">
                      {qa.notes}
                    </p>
                  ) : null}
                  {!qa.pass && qa.requiredFixes?.length ? (
                    <div className="border-t border-line pt-3">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
                        Unresolved fixes
                      </p>
                      <ul className="list-disc pl-5 text-sm text-ink-soft">
                        {qa.requiredFixes.map((fix, i) => (
                          <li key={i}>{fix}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </Card>
            ) : null}

            <Card>
              <CardHeader title="Run details" />
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 p-4 pt-0 text-sm">
                <dt className="text-ink-mute">Post type</dt>
                <dd className="text-ink">{run.postType}</dd>
                {run.format ? (
                  <>
                    <dt className="text-ink-mute">Format</dt>
                    <dd className="text-ink">{run.format}</dd>
                  </>
                ) : null}
                {run.designSize ? (
                  <>
                    <dt className="text-ink-mute">Size</dt>
                    <dd className="text-ink">{run.designSize.replace("x", "×")}</dd>
                  </>
                ) : null}
                {(run.keywords ?? []).length > 0 ? (
                  <>
                    <dt className="text-ink-mute">Keywords</dt>
                    <dd className="text-ink">{(run.keywords ?? []).join(", ")}</dd>
                  </>
                ) : null}
                <dt className="text-ink-mute">Auto-revisions</dt>
                <dd className="text-ink">{run.revisionRounds}</dd>
                <dt className="text-ink-mute">Tokens</dt>
                <dd className="text-ink tabular-nums">
                  {run.tokensPrompt + run.tokensCompletion}
                </dd>
                <dt className="text-ink-mute">Cost</dt>
                <dd className="text-ink tabular-nums">${Number(run.costUsd).toFixed(4)}</dd>
                <dt className="text-ink-mute">Created</dt>
                <dd className="text-ink">{new Date(run.createdAt).toLocaleString()}</dd>
              </dl>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
