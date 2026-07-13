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
  const [tab, setTab] = useState<"draft" | "images">("draft");

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: AgentRun }>(`/api/content-agent/runs/${id}`);
      setRun(res.data);
      if (!dirty.current.content) setContent(res.data.draftText ?? "");
      if (!dirty.current.spec) setSpecText(res.data.specText ?? "");
      if (!dirty.current.caption) setCaption(res.data.captionText ?? "");
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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
            {ready && !run.approvedAt ? (
              <Button size="sm" onClick={approve} loading={approving}>
                Approve
              </Button>
            ) : null}
            {ready || run.status === "FAILED" ? (
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
                      title={`Image ${img.n} — ${img.type === "screenshot" ? "product screenshot" : img.type === "design" ? "designed diagram" : "image"}`}
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
            {run.draftText || ready ? (
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
                          <Link
                            href={`/content/${run.contentId}`}
                            className="text-sm text-accent underline underline-offset-2"
                          >
                            Open CMS draft
                          </Link>
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
