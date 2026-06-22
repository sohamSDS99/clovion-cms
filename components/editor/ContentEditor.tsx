"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TiptapEditor } from "./TiptapEditor";
import { SeoPanel } from "./SeoPanel";
import { CoverImage } from "./CoverImage";
import { TypeFields } from "./TypeFields";
import { ActionBar } from "./ActionBar";
import { RevisionDrawer } from "./RevisionDrawer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Loading, InlineError } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { ApiError, api, errorMessage } from "@/lib/ui/client";
import { contentTypeLabel, slugFromTitle } from "@/lib/ui/format";
import type {
  ContentItem,
  FieldError,
  PublishGateDetails,
  Role,
  SeoData,
  TiptapDoc,
  TransitionAction,
} from "@/lib/ui/types";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Editable slice of the content item kept in local state. */
interface Draft {
  title: string;
  slug: string;
  slugTouched: boolean;
  excerpt: string;
  body: TiptapDoc;
  seo: SeoData;
  typeData: Record<string, unknown>;
  coverAssetId: string | null;
}

const AUTOSAVE_MS = 4000; // <= 10s idle requirement (FR-CONTENT-03).

/**
 * Editor orchestrator (FR-EDITOR-01..08, FR-CONTENT-03/08/09).
 * Loads the item, holds an editable draft, autosaves on idle, supports manual
 * save, drives lifecycle transitions, and surfaces publish-gate field errors
 * inline next to the offending fields.
 */
export function ContentEditor({
  contentId,
  userId,
  role,
}: {
  contentId: string;
  userId: string;
  role: Role;
}) {
  const router = useRouter();
  const toast = useToast();

  const [item, setItem] = useState<ContentItem | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [transitioning, setTransitioning] = useState(false);
  const [gateErrors, setGateErrors] = useState<Record<string, string>>({});
  const [gateWarnings, setGateWarnings] = useState<FieldError[]>([]);
  const [revOpen, setRevOpen] = useState(false);

  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    api
      .get<ContentItem>(`/api/content/${contentId}`)
      .then((it) => {
        if (!active) return;
        setItem(it);
        setDraft(toDraft(it));
      })
      .catch((e) => active && setLoadError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [contentId]);

  // ── Persist helper (manual + autosave share this) ───────────────────────
  const persist = useCallback(
    async (source: "manual" | "autosave") => {
      const d = draftRef.current;
      if (!d) return;
      setSaveState("saving");
      try {
        const updated = await api.patch<ContentItem>(`/api/content/${contentId}`, {
          title: d.title,
          slug: d.slug || undefined,
          excerpt: d.excerpt || null,
          body: d.body,
          seo: d.seo,
          typeData: d.typeData,
          coverAssetId: d.coverAssetId,
          source,
        });
        setItem(updated);
        setSaveState("saved");
        if (source === "manual") toast.success("Saved.");
      } catch (e) {
        setSaveState("error");
        toast.error(errorMessage(e));
      }
    },
    [contentId, toast]
  );

  // ── Debounced autosave on draft change ──────────────────────────────────
  const markDirty = useCallback(() => {
    setSaveState("dirty");
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void persist("autosave"), AUTOSAVE_MS);
  }, [persist]);

  // Flush a pending autosave on unmount / tab hide so nothing is lost.
  useEffect(() => {
    const flush = () => {
      if (autosaveTimer.current && draftRef.current) {
        clearTimeout(autosaveTimer.current);
        void persist("autosave");
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [persist]);

  const update = useCallback(
    (patch: Partial<Draft>) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        // Auto-derive slug from title until the user edits the slug manually.
        if (patch.title !== undefined && !prev.slugTouched) {
          next.slug = slugFromTitle(patch.title);
        }
        return next;
      });
      markDirty();
    },
    [markDirty]
  );

  // ── Lifecycle transition with publish-gate handling ─────────────────────
  async function transition(action: TransitionAction, scheduledAt?: string) {
    // Flush any pending edits first so the gate validates the latest content.
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      await persist("manual");
    }
    setTransitioning(true);
    setGateErrors({});
    setGateWarnings([]);
    try {
      const updated = await api.post<ContentItem>(
        `/api/content/${contentId}/transition`,
        { action, ...(scheduledAt ? { scheduledAt } : {}) }
      );
      setItem(updated);
      setDraft(toDraft(updated));
      toast.success(`Status updated to ${updated.status.toLowerCase().replace("_", " ")}.`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const details = e.details as PublishGateDetails | undefined;
        if (details?.errors?.length) {
          const map: Record<string, string> = {};
          for (const fe of details.errors) map[fe.field] = fe.message;
          setGateErrors(map);
          setGateWarnings(details.warnings ?? []);
          toast.error("Resolve the highlighted fields before publishing.");
        } else {
          toast.error(errorMessage(e));
        }
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setTransitioning(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this content? This cannot be undone from here.")) return;
    try {
      await api.delete(`/api/content/${contentId}`);
      toast.success("Deleted.");
      router.push("/content");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  if (loadError) {
    return (
      <div className="p-6">
        <InlineError message={loadError} />
        <Link href="/content" className="mt-3 inline-block text-sm text-accent">
          ← Back to content
        </Link>
      </div>
    );
  }
  if (!item || !draft) return <Loading />;

  const isOwner = item.createdById === userId;

  return (
    <div className="flex flex-col">
      {/* Sticky action header */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper-raised/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/content"
            className="rounded p-1.5 text-ink-mute hover:bg-paper-sunken hover:text-ink"
            aria-label="Back to content"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
          </Link>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-faint">
              {contentTypeLabel(item.type)}
            </p>
            <SaveIndicator state={saveState} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setRevOpen(true)}>
            History
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={saveState === "saving"}
            onClick={() => persist("manual")}
          >
            Save
          </Button>
        </div>
      </div>

      {/* Lifecycle bar */}
      <div className="border-b border-line bg-paper px-6 py-3">
        <ActionBar
          item={item}
          role={role}
          isOwner={isOwner}
          busy={transitioning}
          onTransition={transition}
        />
        {gateWarnings.length > 0 ? (
          <ul className="mt-2 space-y-0.5 text-xs text-warn">
            {gateWarnings.map((w) => (
              <li key={w.field}>⚠ {w.message}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Main column */}
        <div className="space-y-4">
          <input
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Untitled"
            aria-label="Title"
            className="w-full bg-transparent font-display text-3xl font-semibold tracking-tight text-ink placeholder:text-ink-faint focus:outline-none"
          />
          {gateErrors.title ? (
            <p className="text-xs text-danger">{gateErrors.title}</p>
          ) : null}

          <div className="flex items-center gap-1 text-sm text-ink-mute">
            <span className="text-ink-faint">/{item.type.toLowerCase()}/</span>
            <input
              value={draft.slug}
              onChange={(e) =>
                update({ slug: slugFromTitle(e.target.value), slugTouched: true })
              }
              placeholder="slug"
              aria-label="Slug"
              className="flex-1 bg-transparent text-accent focus:outline-none"
            />
          </div>
          {gateErrors.slug ? (
            <p className="text-xs text-danger">{gateErrors.slug}</p>
          ) : null}

          <Input
            label="Excerpt"
            value={draft.excerpt}
            onChange={(e) => update({ excerpt: e.target.value })}
            placeholder="A short summary shown in listings."
          />

          <TiptapEditor
            initialDoc={draft.body}
            onChange={(body) => update({ body })}
          />
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <CoverImage
            coverAssetId={draft.coverAssetId}
            onChange={(id) => update({ coverAssetId: id })}
            error={gateErrors.coverAssetId}
          />
          <TypeFields
            type={item.type}
            typeData={draft.typeData}
            onChange={(patch) =>
              update({ typeData: { ...draft.typeData, ...patch } })
            }
            fieldErrors={gateErrors}
          />
          <SeoPanel
            seo={draft.seo}
            slug={draft.slug}
            type={item.type}
            title={draft.title}
            onChange={(patch) => update({ seo: { ...draft.seo, ...patch } })}
            fieldErrors={gateErrors}
          />
          <div className="px-1">
            <button
              onClick={handleDelete}
              className="text-xs text-ink-faint hover:text-danger hover:underline"
            >
              Delete this content
            </button>
          </div>
        </aside>
      </div>

      <RevisionDrawer
        open={revOpen}
        onClose={() => setRevOpen(false)}
        contentId={contentId}
        currentRevisionId={item.currentRevisionId}
        onRestored={(it) => {
          setItem(it);
          setDraft(toDraft(it));
        }}
      />
    </div>
  );
}

function toDraft(it: ContentItem): Draft {
  return {
    title: it.title,
    slug: it.slug,
    slugTouched: true, // existing items have a real slug; don't auto-overwrite.
    excerpt: it.excerpt ?? "",
    body: it.body ?? { type: "doc", content: [] },
    seo: it.seo ?? {},
    typeData: it.typeData ?? {},
    coverAssetId: it.coverAssetId,
  };
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { label: string; cls: string }> = {
    idle: { label: "All changes saved", cls: "text-ink-faint" },
    dirty: { label: "Unsaved changes", cls: "text-ink-mute" },
    saving: { label: "Saving…", cls: "text-ink-mute" },
    saved: { label: "Saved", cls: "text-accent" },
    error: { label: "Save failed", cls: "text-danger" },
  };
  const { label, cls } = map[state];
  return (
    <span className={`flex items-center gap-1.5 text-sm font-medium ${cls}`}>
      {state === "saving" ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {label}
    </span>
  );
}
