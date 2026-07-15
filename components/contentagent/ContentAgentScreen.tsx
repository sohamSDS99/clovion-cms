"use client";

/**
 * Content Agent — landing screen: new-run form + runs library.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AgentRun, AgentLesson } from "@prisma/client";
import { PageHeader, PageBody } from "@/components/shell/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldShell, Input, Select, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/ui/client";
import { CHANNELS } from "@/lib/contentagent/channels";
import { sizeOptionsFor } from "@/lib/contentagent/sizes";
import {
  UI_CHANNELS,
  profilesFor,
  contentTypesFor,
  anglesFor,
  needsSourceReport,
  resolveSelection,
} from "@/lib/contentagent/ui";

export function ContentAgentScreen() {
  const router = useRouter();
  const toast = useToast();

  const [uiChannel, setUiChannel] = useState(UI_CHANNELS[0].id);
  const [profile, setProfile] = useState<string | null>("personal");
  const [contentType, setContentType] = useState("text-post");
  const [angle, setAngle] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [sourceReport, setSourceReport] = useState("");
  const [attachments, setAttachments] = useState<{ name: string; text: string }[]>([]);
  const [allowResearch, setAllowResearch] = useState(true);
  const [designSize, setDesignSize] = useState<string>("auto");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [lessons, setLessons] = useState<AgentLesson[]>([]);

  // Manual "reference past content" picker.
  type MemoryHit = { id: string; title: string; sourceType: string; snippet: string };
  const [showReferences, setShowReferences] = useState(false);
  const [refQuery, setRefQuery] = useState("");
  const [refResults, setRefResults] = useState<MemoryHit[]>([]);
  const [refSearching, setRefSearching] = useState(false);
  const [selectedRefs, setSelectedRefs] = useState<MemoryHit[]>([]);

  const profileOptions = profilesFor(uiChannel);
  const contentTypeOptions = contentTypesFor(uiChannel);
  const angleOptions = useMemo(
    () => anglesFor(uiChannel, profile, contentType),
    [uiChannel, profile, contentType]
  );
  const effectiveAngle = angle ?? angleOptions?.[0]?.id ?? null;
  const resolvedPreview = useMemo(() => {
    try {
      return resolveSelection(uiChannel, profile, contentType, effectiveAngle);
    } catch {
      return null;
    }
  }, [uiChannel, profile, contentType, effectiveAngle]);
  const sizeOptions = resolvedPreview
    ? sizeOptionsFor(resolvedPreview.channel, resolvedPreview.format ?? null)
    : null;
  const showSource = needsSourceReport(uiChannel, contentType, effectiveAngle);

  useEffect(() => {
    api
      .get<{ data: AgentLesson[] }>("/api/content-agent/lessons")
      .then((r) => setLessons(r.data))
      .catch(() => {});
  }, []);

  // Debounced content-memory search for the reference picker.
  useEffect(() => {
    const q = refQuery.trim();
    if (!showReferences || q.length < 2) {
      setRefResults([]);
      setRefSearching(false);
      return;
    }
    setRefSearching(true);
    const t = setTimeout(() => {
      api
        .get<{ data: MemoryHit[] }>("/api/content-agent/memory/search", { q })
        .then((r) => setRefResults(r.data))
        .catch(() => setRefResults([]))
        .finally(() => setRefSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [refQuery, showReferences]);

  async function addFiles(files: FileList | File[]) {
    setExtracting(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await api.upload<{ data: { name: string; text: string; truncated: boolean } }>(
          "/api/content-agent/extract",
          form
        );
        setAttachments((prev) => [...prev, { name: res.data.name, text: res.data.text }]);
        if (res.data.truncated) {
          toast.error(`"${res.data.name}" was very long — only the first part is used.`);
        }
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExtracting(false);
    }
  }

  async function create() {
    setCreating(true);
    try {
      const attachmentText = attachments
        .map((a) => `--- REFERENCE: ${a.name} ---\n${a.text}`)
        .join("\n\n");
      const combinedSource = [showSource && sourceReport ? sourceReport : "", attachmentText]
        .filter(Boolean)
        .join("\n\n");
      const resolved = resolveSelection(uiChannel, profile, contentType, effectiveAngle);
      const keywords = keywordsInput
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 10);
      const res = await api.post<{ data: AgentRun }>("/api/content-agent/runs", {
        channel: resolved.channel,
        postType: resolved.postType,
        ...(keywords.length > 0 ? { keywords } : {}),
        ...(sizeOptions && designSize !== "auto" ? { designSize } : {}),
        ...(resolved.format && resolved.format !== "static"
          ? { format: resolved.format }
          : resolved.format === "static"
            ? { format: "static" }
            : {}),
        brief,
        allowResearch,
        ...(combinedSource ? { sourceReport: combinedSource } : {}),
        ...(selectedRefs.length > 0
          ? { referencedMemoryIds: selectedRefs.map((r) => r.id) }
          : {}),
      });
      toast.success("Run started — the agents are working.");
      router.push(`/content-agent/${res.data.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setCreating(false);
    }
  }

  const briefTooShort = brief.trim().length < 10;
  const missingSource =
    showSource && sourceReport.trim().length === 0 && attachments.length === 0;

  return (
    <>
      <PageHeader
        title="Content Agent"
        description="Brief the agents, get a reviewed draft: orchestrator plans, writer drafts, QA checks it against the brand rubric."
        actions={
          <Link href="/content-agent/library">
            <Button variant="secondary" size="sm">
              Library
            </Button>
          </Link>
        }
      />
      <PageBody>
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          {/* New run */}
          <Card>
            <CardHeader title="New generation" />
            <div className="flex flex-col gap-4 p-4 pt-0">
              <FieldShell label="Channel">
                <Select
                  value={uiChannel}
                  onChange={(e) => {
                    const next = e.target.value;
                    setUiChannel(next);
                    setProfile(next === "LINKEDIN" ? "personal" : null);
                    setContentType(next === "WEBSITE" ? "blog-article" : "text-post");
                    setAngle(null);
                  }}
                >
                  {UI_CHANNELS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </FieldShell>

              {profileOptions ? (
                <FieldShell label="Profile" hint="Which voice this is written in.">
                  <Select
                    value={profile ?? profileOptions[0].id}
                    onChange={(e) => {
                      setProfile(e.target.value);
                      setAngle(null);
                    }}
                  >
                    {profileOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </FieldShell>
              ) : null}

              <FieldShell label="Content type">
                <Select
                  value={contentType}
                  onChange={(e) => {
                    setContentType(e.target.value);
                    setAngle(null);
                  }}
                >
                  {contentTypeOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </FieldShell>

              {angleOptions ? (
                <FieldShell label="Angle" hint="The editorial slant.">
                  <Select
                    value={effectiveAngle ?? ""}
                    onChange={(e) => setAngle(e.target.value)}
                  >
                    {angleOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </FieldShell>
              ) : null}

              <FieldShell
                label="Brief"
                hint="Topic, angle, facts to include. The more specific the numbers, the better the draft."
              >
                <Textarea
                  rows={6}
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="e.g. Post about our finding that one buyer constraint rewrites 67% of AI shortlists…"
                />
              </FieldShell>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={
                  "cursor-pointer rounded border border-dashed px-3 py-3 text-center text-sm transition-colors " +
                  (dragOver
                    ? "border-ink bg-paper-sunken text-ink"
                    : "border-line text-ink-mute hover:border-line-strong")
                }
              >
                {extracting
                  ? "Extracting…"
                  : "Drop reference files here (PDF, DOCX, TXT, MD) or click to browse"}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt,.md,.csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              {attachments.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {attachments.map((a, i) => (
                    <li
                      key={`${a.name}-${i}`}
                      className="flex items-center justify-between gap-2 rounded bg-paper-sunken px-2 py-1 text-xs text-ink"
                    >
                      <span className="truncate">
                        {a.name}
                        <span className="ml-1 text-ink-faint">
                          ({Math.round(a.text.length / 1000)}k chars)
                        </span>
                      </span>
                      <button
                        aria-label={`Remove ${a.name}`}
                        className="text-ink-mute hover:text-ink"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAttachments((prev) => prev.filter((_, j) => j !== i));
                        }}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {sizeOptions ? (
                <FieldShell
                  label="Size"
                  hint="Platform-supported artboards; Auto lets the orchestrator pick for the content."
                >
                  <Select value={designSize} onChange={(e) => setDesignSize(e.target.value)}>
                    <option value="auto">Auto — agent recommends</option>
                    {sizeOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </FieldShell>
              ) : null}

              {uiChannel === "WEBSITE" ? (
                <FieldShell
                  label="SEO keywords"
                  hint="Comma-separated; the first is the primary keyword (title, intro, one heading)."
                >
                  <Input
                    value={keywordsInput}
                    onChange={(e) => setKeywordsInput(e.target.value)}
                    placeholder="ai visibility tracking, geo optimization, ai search"
                  />
                </FieldShell>
              ) : null}

              {showSource ? (
                <FieldShell
                  label="Source report"
                  hint="Paste the raw report text — the article's numbers come only from here."
                >
                  <Textarea
                    rows={8}
                    value={sourceReport}
                    onChange={(e) => setSourceReport(e.target.value)}
                    placeholder="Paste the full report…"
                  />
                </FieldShell>
              ) : null}

              <label className="flex cursor-pointer items-start gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={allowResearch}
                  onChange={(e) => setAllowResearch(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Allow quick web research — the orchestrator may run up to 3
                  searches to back key claims with sourced data (only where the brief
                  doesn&apos;t already provide it).
                </span>
              </label>

              {/* Reference past content (optional) — semantic memory picker. */}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowReferences((v) => !v)}
                  className="flex items-center gap-1 text-left text-sm text-ink-mute hover:text-ink"
                >
                  <span className="text-xs">{showReferences ? "\u25be" : "\u25b8"}</span>
                  Reference past content (optional)
                  {selectedRefs.length > 0 ? (
                    <span className="ml-1 text-xs text-ink-faint">
                      ({selectedRefs.length} selected)
                    </span>
                  ) : null}
                </button>

                {selectedRefs.length > 0 ? (
                  <ul className="flex flex-wrap gap-1">
                    {selectedRefs.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center gap-1 rounded bg-paper-sunken px-2 py-1 text-xs text-ink"
                      >
                        <span className="max-w-[16rem] truncate">{r.title}</span>
                        <button
                          type="button"
                          aria-label={`Remove reference ${r.title}`}
                          className="text-ink-mute hover:text-ink"
                          onClick={() =>
                            setSelectedRefs((prev) => prev.filter((x) => x.id !== r.id))
                          }
                        >
                          \u2715
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {showReferences ? (
                  <FieldShell
                    label=""
                    hint="Search prior approved pieces; the writer will stay consistent with the ones you add."
                  >
                    <Input
                      value={refQuery}
                      onChange={(e) => setRefQuery(e.target.value)}
                      placeholder="Search past content by topic or title…"
                    />
                    {refQuery.trim().length >= 2 ? (
                      <div className="mt-2 max-h-56 overflow-auto rounded border border-line">
                        {refSearching ? (
                          <p className="px-3 py-2 text-xs text-ink-mute">Searching…</p>
                        ) : refResults.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-ink-mute">No matches.</p>
                        ) : (
                          <ul className="divide-y divide-line">
                            {refResults.map((r) => {
                              const added = selectedRefs.some((x) => x.id === r.id);
                              return (
                                <li
                                  key={r.id}
                                  className="flex items-start justify-between gap-2 px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm text-ink">{r.title}</p>
                                    <p className="truncate text-xs text-ink-faint">
                                      {r.snippet}
                                    </p>
                                  </div>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={added || selectedRefs.length >= 5}
                                    onClick={() =>
                                      setSelectedRefs((prev) =>
                                        prev.some((x) => x.id === r.id) ? prev : [...prev, r]
                                      )
                                    }
                                  >
                                    {added ? "Added" : "Add"}
                                  </Button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </FieldShell>
                ) : null}
              </div>

              <Button
                onClick={create}
                loading={creating}
                disabled={briefTooShort || missingSource}
              >
                Generate
              </Button>
            </div>
          </Card>

          {/* Learned rules (auto-improvement loop) */}
          <Card>
            <CardHeader
              title="Learned rules"
              subtitle="Extracted automatically when you approve a run — applied to every future generation. Delete any that miss the mark."
            />
            <div className="p-4 pt-0">
              {lessons.length === 0 ? (
                <p className="text-sm text-ink-mute">
                  Nothing learned yet. Approve a run after editing it (or giving
                  feedback) and the agents will extract durable style rules from
                  the difference.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {lessons.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 text-sm text-ink">
                        {l.lesson}
                        <span className="ml-2 text-xs text-ink-faint">
                          {CHANNELS.find((c) => c.id === l.channel)?.label ?? l.channel}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Remove rule"
                        onClick={async () => {
                          try {
                            await api.delete(`/api/content-agent/lessons/${l.id}`);
                            setLessons((prev) => prev.filter((x) => x.id !== l.id));
                            toast.success("Rule removed.");
                          } catch (err) {
                            toast.error(errorMessage(err));
                          }
                        }}
                      >
                        ✕
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
