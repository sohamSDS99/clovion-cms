"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea, Select, Label } from "@/components/ui/Field";
import { InlineError } from "@/components/ui/Feedback";
import { MediaPicker } from "@/components/media/MediaPicker";
import { cn } from "@/lib/ui/cn";
import {
  contentTypeLabel,
  slugFromTitle,
  statusBadge,
  localInputToIso,
} from "@/lib/ui/format";
import { actionsForStatus, canRoleAttempt } from "@/lib/ui/actions";
import { api } from "@/lib/ui/client";
import {
  type AiBrief,
  type AiMode,
  aiErrorMessage,
  isRetryable,
  defaultStrategy,
} from "@/lib/editor/ai";
import type {
  ContentItem,
  ContentType,
  FaqItem,
  MediaAsset,
  Role,
  TiptapDoc,
  TransitionAction,
} from "@/lib/ui/types";
import type { Draft } from "./layouts/types";
import { TiptapEditor } from "./TiptapEditor";
import { TypeFields } from "./TypeFields";
import { FaqSection } from "./parts/FaqSection";
import { SeoPanel } from "./SeoPanel";
import { SchemaPanel } from "./SchemaPanel";
import { AiAssistedBadge } from "./AiAssistedBadge";
import { useAiGeneration, type GenerateArgs } from "./useAiGeneration";
import type { AiInsertPayload, InsertStrategy } from "./AiWritePanel";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
type InspectorTab = "details" | "seo" | "faq" | "ai";

interface AuthorOption {
  id: string;
  displayName: string;
}

/**
 * The editor workspace (FR-EDITOR-01..08). A FIXED-HEIGHT two-pane shell that
 * never grows the page: a left editor card (title + toolbar + internally
 * scrolling body + word count) and a right inspector with Details / SEO / AI
 * Writer tabs. Identical for every content type; RESOURCE adds a PDF field in
 * Details (via TypeFields). All state/persistence lives in the parent
 * ContentEditor — this component only arranges UI and calls back.
 */
export function EditorWorkspace({
  item,
  draft,
  update,
  gateErrors,
  gateWarnings,
  contentId,
  initialSchema,
  role,
  isOwner,
  saveState,
  transitioning,
  authors,
  selection,
  aiAssisted,
  onEditorReady,
  onSaveDraft,
  onUpdateAndPublish,
  onTransition,
  onAiInsert,
  onOpenHistory,
  onDelete,
}: {
  item: ContentItem;
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  gateErrors: Record<string, string>;
  gateWarnings: { field: string; message: string }[];
  contentId: string;
  initialSchema: unknown;
  role: Role;
  isOwner: boolean;
  saveState: SaveState;
  transitioning: boolean;
  authors: AuthorOption[];
  selection: { has: boolean; text: string };
  aiAssisted: boolean;
  onEditorReady: (editor: Editor | null) => void;
  onSaveDraft: () => void;
  onUpdateAndPublish: () => void;
  onTransition: (action: TransitionAction, scheduledAt?: string) => void;
  onAiInsert: (payload: AiInsertPayload) => Promise<void> | void;
  onOpenHistory: () => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<InspectorTab>("details");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleErr, setScheduleErr] = useState<string | null>(null);

  const meta = statusBadge(item.status);
  const counts = useMemo(() => wordCount(draft.body), [draft.body]);

  // Optional embeddable FAQ section — lives in its own inspector tab (keeps the
  // article body clean). Every article-shaped type gets it, including the FAQ
  // type itself; only WEBINAR (event-shaped) is excluded.
  const supportsFaq = item.type !== "WEBINAR";
  const faqItems: FaqItem[] = Array.isArray(draft.typeData.faqItems)
    ? (draft.typeData.faqItems as FaqItem[])
    : [];

  // Lifecycle actions valid for the current status, role-gated for UX.
  const lifecycle = actionsForStatus(item.status).map((spec) => ({
    ...spec,
    enabled: canRoleAttempt(role, spec.action, { isOwner, selfPublish: true }),
  }));

  // Published posts get a dedicated bar: Unpublish · Save changes · Update &
  // publish (a save that also pushes the edits live). "Save changes" stages
  // edits without touching the live site; "Update & publish" propagates them.
  const isPublished = item.status === "PUBLISHED";
  const canUnpublish = canRoleAttempt(role, "unpublish", { isOwner });
  const canPublishUpdate = canRoleAttempt(role, "publish_now", {
    isOwner,
    selfPublish: true,
  });

  function confirmSchedule() {
    const iso = localInputToIso(scheduleAt);
    if (!iso || new Date(iso).getTime() <= Date.now()) {
      setScheduleErr("Pick a date and time in the future.");
      return;
    }
    setScheduleErr(null);
    setScheduleOpen(false);
    onTransition("schedule", iso);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-paper">
      {/* ── Top action bar ─────────────────────────────────────────────── */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-5 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/content"
            aria-label="Back to content"
            className="grid h-8 w-8 place-items-center rounded-md text-ink-mute hover:bg-paper-sunken hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
          </Link>
          <h1 className="max-w-[40ch] truncate text-lg font-semibold text-ink">
            {draft.title || `New ${contentTypeLabel(item.type)}`}
          </h1>
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <AiAssistedBadge visible={aiAssisted} />
          <SaveDot state={saveState} />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            title="Open a full-page preview (last saved version) in a new tab"
            onClick={() =>
              window.open(`/preview/${contentId}`, "_blank", "noopener,noreferrer")
            }
          >
            Preview
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenHistory}>
            History
          </Button>
          {isPublished ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canUnpublish || transitioning}
                title={!canUnpublish ? "Your role can't perform this action" : undefined}
                onClick={() => onTransition("unpublish")}
              >
                Unpublish
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={saveState === "saving"}
                onClick={onSaveDraft}
              >
                <IconSave /> Save changes
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={saveState === "saving"}
                disabled={!canPublishUpdate || transitioning}
                title={!canPublishUpdate ? "Your role can't perform this action" : undefined}
                onClick={onUpdateAndPublish}
              >
                <IconSend /> Update &amp; publish
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                loading={saveState === "saving"}
                onClick={onSaveDraft}
              >
                <IconSave /> Save draft
              </Button>
              {lifecycle.map((spec) => {
                const isPublish =
                  spec.action === "publish_now" || spec.action === "approve_publish";
                const isSchedule = spec.action === "schedule";
                const variant = isPublish ? "primary" : "secondary";
                // Keep the bar tidy: secondary lifecycle moves (submit/reject/etc.)
                // render as ghost so Publish/Schedule stay the focal actions.
                const v = isPublish || isSchedule ? variant : "ghost";
                return (
                  <Button
                    key={spec.action}
                    variant={v}
                    size="sm"
                    disabled={!spec.enabled || transitioning}
                    title={!spec.enabled ? "Your role can't perform this action" : undefined}
                    onClick={() =>
                      isSchedule ? setScheduleOpen(true) : onTransition(spec.action)
                    }
                  >
                    {isSchedule ? <IconCalendar /> : isPublish ? <IconSend /> : null}
                    {spec.label}
                  </Button>
                );
              })}
            </>
          )}
        </div>
      </header>

      {gateWarnings.length > 0 ? (
        <ul className="shrink-0 space-y-0.5 border-b border-warn/30 bg-warn-soft px-6 py-2 text-xs text-warn">
          {gateWarnings.map((w) => (
            <li key={w.field}>⚠ {w.message}</li>
          ))}
        </ul>
      ) : null}

      {/* ── Two-pane body (fixed height; each pane scrolls on its own) ──── */}
      <div className="flex min-h-0 flex-1 gap-5 overflow-hidden p-5">
        {/* Editor card. WEBINAR gets a YouTube-style upload flow (video +
            cover + title + description) instead of the article-first body. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-paper-raised shadow-card">
          {item.type === "WEBINAR" ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
              <VideoField
                assetId={(draft.typeData.videoAssetId as string | undefined) ?? null}
                onChange={(id) =>
                  update({
                    typeData: { ...draft.typeData, videoAssetId: id ?? undefined },
                  })
                }
              />
              <ImageField
                label="Cover image"
                assetId={draft.coverAssetId}
                onChange={(id) => update({ coverAssetId: id })}
                error={gateErrors.coverAssetId}
              />
              <Input
                label="Title"
                value={draft.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="Webinar title"
              />
              <div>
                <Label>Description</Label>
                <TiptapEditor
                  initialDoc={draft.body}
                  onChange={(body: TiptapDoc) => update({ body })}
                  onReady={onEditorReady}
                  placeholder="Describe this webinar..."
                />
              </div>
            </div>
          ) : (
            <>
              <input
                value={draft.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="Title"
                aria-label="Title"
                className="shrink-0 border-b border-line bg-transparent px-6 py-4 text-3xl font-semibold tracking-tight text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <TiptapEditor
                fill
                initialDoc={draft.body}
                onChange={(body: TiptapDoc) => update({ body })}
                onReady={onEditorReady}
                placeholder="Start writing..."
              />
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-6 py-2 text-xs text-ink-mute">
                <span>
                  {counts.words} words · {counts.chars} characters
                </span>
              </div>
            </>
          )}
        </div>

        {/* Inspector */}
        <aside className="flex w-[360px] shrink-0 flex-col overflow-hidden">
          <div
            role="tablist"
            aria-label="Inspector"
            className="mb-4 inline-flex shrink-0 gap-1 rounded-xl border border-line bg-paper-sunken p-1"
          >
            <TabButton active={tab === "details"} onClick={() => setTab("details")}>
              Details
            </TabButton>
            <TabButton active={tab === "seo"} onClick={() => setTab("seo")}>
              SEO
            </TabButton>
            {supportsFaq ? (
              <TabButton active={tab === "faq"} onClick={() => setTab("faq")}>
                FAQ
              </TabButton>
            ) : null}
            <TabButton active={tab === "ai"} onClick={() => setTab("ai")}>
              AI Writer
            </TabButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            {tab === "details" ? (
              <DetailsTab
                item={item}
                draft={draft}
                update={update}
                gateErrors={gateErrors}
                authors={authors}
                onDelete={onDelete}
              />
            ) : tab === "seo" ? (
              <div className="space-y-4">
                <SeoPanel
                  seo={draft.seo}
                  slug={draft.slug}
                  type={item.type}
                  title={draft.title}
                  onChange={(patch) => update({ seo: { ...draft.seo, ...patch } })}
                  fieldErrors={gateErrors}
                />
                <SchemaPanel contentId={contentId} initialSchema={initialSchema} />
              </div>
            ) : tab === "faq" ? (
              <FaqSection
                contentId={contentId}
                contentType={item.type as ContentType}
                items={faqItems}
                onChange={(next) =>
                  update({ typeData: { ...draft.typeData, faqItems: next } })
                }
                error={gateErrors["typeData.faqItems"]}
                title="Frequently Asked Questions"
                emptyTitle="No questions yet"
                emptyBody="Add common reader questions, or generate them from the article with AI. Each pair also feeds FAQPage schema."
              />
            ) : (
              <AiWriterTab
                contentId={contentId}
                contentType={item.type}
                selection={selection}
                onInsert={onAiInsert}
              />
            )}
          </div>
        </aside>
      </div>

      <Modal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Schedule publish"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={confirmSchedule}>Schedule</Button>
          </>
        }
      >
        <Input
          type="datetime-local"
          label="Publish at"
          value={scheduleAt}
          onChange={(e) => { setScheduleAt(e.target.value); setScheduleErr(null); }}
          error={scheduleErr ?? undefined}
          autoFocus
        />
        <p className="mt-2 text-xs text-ink-mute">
          The item publishes automatically at this local time.
        </p>
      </Modal>
    </div>
  );
}

/* ── Details tab ────────────────────────────────────────────────────────── */
function DetailsTab({
  item,
  draft,
  update,
  gateErrors,
  authors,
  onDelete,
}: {
  item: ContentItem;
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  gateErrors: Record<string, string>;
  authors: AuthorOption[];
  onDelete: () => void;
}) {
  return (
    <div className="space-y-5">
      {item.type === "RESOURCE" ? (
        <DownloadableFileField
          assetId={(draft.typeData.pdfAssetId as string | undefined) ?? null}
          onChange={(id) =>
            update({
              typeData: { ...draft.typeData, pdfAssetId: id ?? undefined },
            })
          }
          error={gateErrors["typeData.pdfAssetId"]}
        />
      ) : null}

      {/* WEBINAR's cover lives in the main upload flow, not here. */}
      {item.type !== "WEBINAR" ? (
        <ImageField
          label="Cover image"
          assetId={draft.coverAssetId}
          onChange={(id) => update({ coverAssetId: id })}
          error={gateErrors.coverAssetId}
        />
      ) : null}

      <ImageField
        label="Social share image"
        hint="Used only when this page is shared on social media (Open Graph). Falls back to the cover image if left empty."
        assetId={(draft.seo.ogImageAssetId as string | undefined) ?? null}
        onChange={(id) =>
          update({ seo: { ...draft.seo, ogImageAssetId: id ?? undefined } })
        }
      />

      <div>
        <Label>Slug</Label>
        <Input
          value={draft.slug}
          onChange={(e) =>
            update({ slug: slugFromTitle(e.target.value), slugTouched: true })
          }
          placeholder="auto-generated-from-title"
          error={gateErrors.slug}
        />
      </div>

      <Textarea
        label="Excerpt"
        rows={3}
        value={draft.excerpt}
        onChange={(e) => update({ excerpt: e.target.value })}
        placeholder="A short summary shown in listings."
      />

      <Input
        label="Category"
        value={draft.category}
        onChange={(e) => update({ category: e.target.value })}
        placeholder="e.g. Product"
      />

      <Input
        label="Tags (comma separated)"
        value={draft.tags}
        onChange={(e) => update({ tags: e.target.value })}
        placeholder="react, fastapi"
      />

      <div>
        <Label>Author</Label>
        <Select
          value={draft.authorProfileId ?? ""}
          onChange={(e) => update({ authorProfileId: e.target.value || null })}
        >
          <option value="">— No author —</option>
          {authors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayName}
            </option>
          ))}
        </Select>
      </div>

      {/* Type-specific fields (Webinar/News). RESOURCE's downloadable file
          renders at the top of this tab, so it is handled separately above. */}
      {item.type === "WEBINAR" || item.type === "NEWS" ? (
        <TypeFields
          type={item.type}
          typeData={draft.typeData}
          onChange={(patch) => update({ typeData: { ...draft.typeData, ...patch } })}
          fieldErrors={gateErrors}
        />
      ) : null}

      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-danger underline-offset-2 hover:underline"
      >
        Delete this content
      </button>
    </div>
  );
}

/* ── Image field (inline dashed uploader) — used for cover + OG share image ─ */
function ImageField({
  label,
  hint,
  assetId,
  onChange,
  error,
}: {
  label: string;
  hint?: string;
  assetId: string | null;
  onChange: (id: string | null) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [asset, setAsset] = useState<MediaAsset | null>(null);

  useEffect(() => {
    if (!assetId) {
      setAsset(null);
      return;
    }
    let active = true;
    api
      .get<MediaAsset>(`/api/media/${assetId}`)
      .then((a) => active && setAsset(a))
      .catch(() => active && setAsset(null));
    return () => {
      active = false;
    };
  }, [assetId]);

  return (
    <div>
      <Label>{label}</Label>
      {hint ? <p className="mb-1.5 text-xs text-ink-mute">{hint}</p> : null}
      {assetId ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border border-line bg-paper-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset?.variants?.md ?? asset?.url}
              alt={asset?.altText ?? label}
              className="aspect-[16/9] w-full object-cover"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              Replace
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex aspect-[16/6] w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-paper text-ink-mute transition-colors hover:border-ink-faint hover:text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" />
          </svg>
          <span className="text-sm font-medium">Upload image</span>
        </button>
      )}
      {error ? <p className="mt-1 text-xs text-danger" role="alert">{error}</p> : null}

      <MediaPicker
        open={open}
        onClose={() => setOpen(false)}
        kind="IMAGE"
        title={`Choose ${label.toLowerCase()}`}
        onPick={(a) => {
          onChange(a.id);
          setOpen(false);
        }}
      />
    </div>
  );
}

/* ── Webinar video — dashed uploader, YouTube-upload style ──────────────── */
function VideoField({
  assetId,
  onChange,
}: {
  assetId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [asset, setAsset] = useState<MediaAsset | null>(null);

  useEffect(() => {
    if (!assetId) {
      setAsset(null);
      return;
    }
    let active = true;
    api
      .get<MediaAsset>(`/api/media/${assetId}`)
      .then((a) => active && setAsset(a))
      .catch(() => active && setAsset(null));
    return () => {
      active = false;
    };
  }, [assetId]);

  return (
    <div>
      <Label>Video</Label>
      {assetId ? (
        <div className="space-y-2">
          {asset?.url ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={asset.url}
              controls
              preload="metadata"
              className="aspect-video w-full rounded-lg border border-line bg-black"
            />
          ) : null}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-paper-sunken p-2.5 text-sm">
            <span className="truncate text-ink-soft">{asset?.filename ?? "Attached video"}</span>
            <div className="flex gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
                Replace
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-paper text-ink-mute transition-colors hover:border-ink-faint hover:text-ink"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />
          </svg>
          <span className="text-sm font-medium">Upload video</span>
          <span className="text-xs text-ink-faint">MP4 or WebM</span>
        </button>
      )}

      <MediaPicker
        open={open}
        onClose={() => setOpen(false)}
        kind="VIDEO"
        title="Choose video"
        onPick={(a) => {
          onChange(a.id);
          setOpen(false);
        }}
      />
    </div>
  );
}

/* ── Downloadable file (RESOURCE) — dashed uploader matching the cover field ─ */
function DownloadableFileField({
  assetId,
  onChange,
  error,
}: {
  assetId: string | null;
  onChange: (id: string | null) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [asset, setAsset] = useState<MediaAsset | null>(null);

  useEffect(() => {
    if (!assetId) {
      setAsset(null);
      return;
    }
    let active = true;
    api
      .get<MediaAsset>(`/api/media/${assetId}`)
      .then((a) => active && setAsset(a))
      .catch(() => active && setAsset(null));
    return () => {
      active = false;
    };
  }, [assetId]);

  return (
    <div>
      <Label>Downloadable file</Label>
      {assetId ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-paper-sunken p-2.5 text-sm">
          <span className="truncate text-ink-soft">{asset?.filename ?? "Attached file"}</span>
          <div className="flex gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              Replace
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex aspect-[16/6] w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-paper text-ink-mute transition-colors hover:border-ink-faint hover:text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
          </svg>
          <span className="text-sm font-medium">Upload file</span>
        </button>
      )}
      {error ? <p className="mt-1 text-xs text-danger" role="alert">{error}</p> : null}

      <MediaPicker
        open={open}
        onClose={() => setOpen(false)}
        kind="PDF"
        title="Choose downloadable file"
        onPick={(a) => {
          onChange(a.id);
          setOpen(false);
        }}
      />
    </div>
  );
}

/* ── AI Writer tab ──────────────────────────────────────────────────────── */
const AI_MODES: { value: AiMode; label: string }[] = [
  { value: "full_draft", label: "Full draft" },
  { value: "section", label: "Section" },
  { value: "outline", label: "Outline" },
  { value: "rewrite", label: "Rewrite selection" },
];

function AiWriterTab({
  contentId,
  contentType,
  selection,
  onInsert,
}: {
  contentId: string;
  contentType: ContentItem["type"];
  selection: { has: boolean; text: string };
  onInsert: (payload: AiInsertPayload) => Promise<void> | void;
}) {
  const gen = useAiGeneration();
  const [mode, setMode] = useState<AiMode>("full_draft");
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [strategy, setStrategy] = useState<InsertStrategy>("replace");
  const [inserting, setInserting] = useState(false);

  useEffect(() => setStrategy(defaultStrategy(mode)), [mode]);

  const busy = gen.status === "streaming";
  const canInsert = gen.status === "done" && gen.result !== null;
  const briefValid =
    mode === "rewrite"
      ? selection.has
      : mode === "section"
        ? sectionName.trim().length > 0 || topic.trim().length > 0
        : topic.trim().length > 0;

  function run() {
    const brief: AiBrief = {
      topic: topic.trim() || undefined,
      keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
    };
    if (mode === "section") brief.sectionName = sectionName.trim() || undefined;
    if (mode === "rewrite") brief.selectedText = selection.text;
    if (brief.keywords && brief.keywords.length === 0) delete brief.keywords;
    const args: GenerateArgs = { contentId, contentType, mode, brief };
    void gen.generate(args);
  }

  async function insert() {
    if (!gen.result) return;
    setInserting(true);
    try {
      await onInsert({ mode, strategy, result: gen.result });
      gen.reset();
      setTopic("");
    } finally {
      setInserting(false);
    }
  }

  const previewText = gen.status === "done" ? gen.result?.html ?? "" : gen.partialText;

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-mute">
        Drafts are grounded in your <strong>Knowledge Base</strong> and follow your{" "}
        <strong>Writing Style</strong>. Nothing is added until you click Insert —
        AI output stays a draft.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {AI_MODES.map((m) => {
          const disabled = m.value === "rewrite" && !selection.has;
          return (
            <button
              key={m.value}
              type="button"
              disabled={disabled || busy}
              onClick={() => setMode(m.value)}
              aria-pressed={mode === m.value}
              title={disabled ? "Select text in the editor first" : undefined}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                mode === m.value
                  ? "border-ink bg-ink text-white"
                  : "border-line-strong bg-paper-raised text-ink-soft hover:bg-paper-sunken",
                (disabled || busy) && "cursor-not-allowed opacity-50"
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === "rewrite" ? (
        <div className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-soft">
          {selection.text.trim() || (
            <span className="text-ink-faint">Select text in the editor to rewrite.</span>
          )}
        </div>
      ) : (
        <Input
          label={mode === "section" ? "Topic / angle (optional)" : "Topic / angle"}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What should the AI write about?"
          disabled={busy}
        />
      )}

      {mode === "section" ? (
        <Input
          label="Section name"
          value={sectionName}
          onChange={(e) => setSectionName(e.target.value)}
          placeholder="e.g. Key benefits"
          disabled={busy}
        />
      ) : null}

      {mode !== "rewrite" ? (
        <Input
          label="Target keyword(s)"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="comma-separated"
          disabled={busy}
        />
      ) : null}

      <div className="flex items-center gap-2">
        {busy ? (
          <Button variant="danger" size="sm" onClick={gen.stop}>Stop</Button>
        ) : (
          <Button variant="primary" size="sm" onClick={run} disabled={!briefValid}>
            {gen.status === "done" || gen.status === "error" || gen.status === "aborted"
              ? "Regenerate"
              : "Generate"}
          </Button>
        )}
        {busy ? (
          <span className="flex items-center gap-1.5 text-xs text-ink-mute">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Streaming…
          </span>
        ) : null}
      </div>

      {gen.status === "error" && gen.error ? (
        <div className="space-y-2">
          <InlineError message={aiErrorMessage(gen.error.code, gen.error.message)} />
          {isRetryable(gen.error.code) ? (
            <Button variant="secondary" size="sm" onClick={run}>Retry</Button>
          ) : null}
        </div>
      ) : null}

      {(busy || gen.status === "done" || gen.partialText) && gen.status !== "error" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Preview</Label>
            {gen.status === "done" ? (
              <Badge tone="review">Review before publish</Badge>
            ) : null}
          </div>
          {gen.status === "done" && gen.result?.lowGrounding ? (
            <div role="alert" className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn">
              ⚠ Low knowledge-base grounding — verify facts before publishing.
            </div>
          ) : null}
          <div className="max-h-72 overflow-y-auto rounded-lg border border-line bg-paper p-3">
            {gen.status === "done" ? (
              <div className="tiptap text-sm" dangerouslySetInnerHTML={{ __html: previewText }} />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-ink-soft">
                {previewText || <span className="text-ink-faint">Waiting for output…</span>}
              </pre>
            )}
          </div>
        </div>
      ) : null}

      {canInsert && gen.result ? (
        <div className="space-y-2 border-t border-line pt-3">
          {mode !== "rewrite" && mode !== "section" ? (
            <div className="flex gap-2">
              <StrategyChip label="Replace" active={strategy === "replace"} onClick={() => setStrategy("replace")} />
              <StrategyChip label="Append" active={strategy === "append"} onClick={() => setStrategy("append")} />
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={insert} loading={inserting}>Insert</Button>
            <Button variant="ghost" size="sm" onClick={() => gen.reset()} disabled={inserting}>Discard</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StrategyChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-3 py-1.5 text-[13px] transition-colors",
        active ? "border-ink bg-ink text-white" : "border-line-strong bg-paper-raised text-ink-soft hover:bg-paper-sunken"
      )}
    >
      {label}
    </button>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────────── */
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      type="button"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-paper-raised text-ink shadow-card" : "text-ink-mute hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

function SaveDot({ state }: { state: SaveState }) {
  const map: Record<SaveState, { label: string; cls: string }> = {
    idle: { label: "Saved", cls: "text-ink-faint" },
    dirty: { label: "Unsaved", cls: "text-ink-mute" },
    saving: { label: "Saving…", cls: "text-ink-mute" },
    saved: { label: "Saved", cls: "text-accent" },
    error: { label: "Save failed", cls: "text-danger" },
  };
  const { label, cls } = map[state];
  return <span className={cn("text-xs font-medium", cls)}>{label}</span>;
}

function wordCount(doc: TiptapDoc): { words: number; chars: number } {
  const text = plainText(doc);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { words, chars: text.length };
}

function plainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) {
    return n.content.map(plainText).join(" ");
  }
  return "";
}

function IconSave() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>;
}
function IconCalendar() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>;
}
function IconSend() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></svg>;
}
