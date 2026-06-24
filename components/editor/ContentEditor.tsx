"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Editor } from "@tiptap/react";
import { ContentLayout } from "./layouts/ContentLayout";
import type { Draft } from "./layouts/types";
import { ActionBar } from "./ActionBar";
import { RevisionDrawer } from "./RevisionDrawer";
import { AiWritePanel, type AiInsertPayload } from "./AiWritePanel";
import { AiAssistedBadge } from "./AiAssistedBadge";
import { applyAiInsert } from "./applyAiInsert";
import { Button } from "@/components/ui/Button";
import { Loading, InlineError } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { ApiError, api, errorMessage } from "@/lib/ui/client";
import { contentTypeLabel, slugFromTitle } from "@/lib/ui/format";
import type {
  ContentItem,
  ContentRevision,
  FieldError,
  PublishGateDetails,
  Role,
  TransitionAction,
} from "@/lib/ui/types";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_MS = 4000; // <= 10s idle requirement (FR-CONTENT-03).

/**
 * Editor orchestrator (FR-EDITOR-01..08, FR-CONTENT-03/08/09).
 * Loads the item, holds an editable draft, autosaves on idle, supports manual
 * save, drives lifecycle transitions, and surfaces publish-gate field errors
 * inline next to the offending fields.
 *
 * Wave-2 additions: an AI Write panel (streamed draft generation merged only on
 * explicit Insert), an AI-assisted review badge, and a JSON-LD schema panel.
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

  // ── AI Write state ──────────────────────────────────────────────────────
  const [aiOpen, setAiOpen] = useState(false);
  const [aiAssisted, setAiAssisted] = useState(false); // session/badge flag
  const [selection, setSelection] = useState<{ has: boolean; text: string }>({
    has: false,
    text: "",
  });
  const editorRef = useRef<Editor | null>(null);

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
        setAiAssisted(currentRevisionIsAi(it));
      })
      .catch((e) => active && setLoadError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [contentId]);

  // ── Persist helper (manual + autosave + AI insert share this) ────────────
  const persist = useCallback(
    async (source: "manual" | "autosave" | "ai_generation") => {
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
        // A manual save clears the AI-assisted badge (human reviewed & saved).
        if (source === "manual") setAiAssisted(false);
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

  // ── AI Write integration ────────────────────────────────────────────────
  // Track the editor instance + its selection so the AI panel can offer
  // "Rewrite selection" and insert via ProseMirror commands.
  const handleEditorReady = useCallback((editor: Editor | null) => {
    editorRef.current = editor;
    if (!editor) {
      setSelection({ has: false, text: "" });
      return;
    }
    const sync = () => {
      const { from, to, empty } = editor.state.selection;
      const text = empty ? "" : editor.state.doc.textBetween(from, to, " ");
      setSelection({ has: !empty && text.trim().length > 0, text });
    };
    editor.on("selectionUpdate", sync);
    editor.on("transaction", sync);
    sync();
  }, []);

  // Apply a generated draft to the live editor (explicit Insert only), then
  // PATCH with source:"ai_generation" so the server tags an AI revision and the
  // "review before publish" badge persists until a human saves manually.
  const handleAiInsert = useCallback(
    async (payload: AiInsertPayload) => {
      const editor = editorRef.current;
      if (!editor) {
        toast.error("Editor is not ready.");
        return;
      }
      const nextDoc = applyAiInsert(
        editor,
        payload.mode,
        payload.strategy,
        payload.result.tiptap
      );
      // Sync local draft, mark dirty, then persist as an AI revision.
      setDraft((prev) => (prev ? { ...prev, body: nextDoc } : prev));
      setAiAssisted(true);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      // Use the just-built doc rather than the (async) state for the PATCH.
      draftRef.current = draftRef.current
        ? { ...draftRef.current, body: nextDoc }
        : draftRef.current;
      await persist("ai_generation");
      toast.success("AI draft inserted. Review before publishing.");
    },
    [persist, toast]
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
    if (
      !confirm(
        "Delete this content? It will be removed from the website and the CMS. An admin can restore it later."
      )
    )
      return;
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
          <AiAssistedBadge visible={aiAssisted} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAiOpen(true)}
            title="Generate a draft with AI"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
              <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
            </svg>
            AI Write
          </Button>
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

      {/* Per-type layout: arranges title/body/fields by what each type needs. */}
      <ContentLayout
        item={item}
        draft={draft}
        update={update}
        gateErrors={gateErrors}
        contentId={contentId}
        initialSchema={schemaMarkupOf(item)}
        onEditorReady={handleEditorReady}
        onDelete={handleDelete}
      />

      <AiWritePanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        contentId={contentId}
        contentType={item.type}
        hasSelection={selection.has}
        selectedText={selection.text}
        onInsert={handleAiInsert}
      />

      <RevisionDrawer
        open={revOpen}
        onClose={() => setRevOpen(false)}
        contentId={contentId}
        currentRevisionId={item.currentRevisionId}
        onRestored={(it) => {
          setItem(it);
          setDraft(toDraft(it));
          setAiAssisted(currentRevisionIsAi(it));
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

/**
 * Best-effort read of the item's current revision source for the AI-assisted
 * badge. The list endpoint isn't fetched here, so we look for an inlined hint
 * the API may provide (currentRevision.source); absent that the badge is driven
 * by the per-session insert flag instead.
 */
function currentRevisionIsAi(it: ContentItem): boolean {
  const inlined = (it as { currentRevision?: ContentRevision }).currentRevision;
  return inlined?.source === "AI_GENERATION";
}

/** Read schemaMarkup off the item without coupling to the shared type. */
function schemaMarkupOf(it: ContentItem): unknown {
  return (it as { schemaMarkup?: unknown }).schemaMarkup ?? null;
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
