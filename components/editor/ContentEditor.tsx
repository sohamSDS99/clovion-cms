"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Editor } from "@tiptap/react";
import type { Draft } from "./layouts/types";
import { RevisionDrawer } from "./RevisionDrawer";
import { EditorWorkspace } from "./EditorWorkspace";
import type { AiInsertPayload } from "./AiWritePanel";
import { applyAiInsert } from "./applyAiInsert";
import { Loading, InlineError } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { ApiError, api, errorMessage } from "@/lib/ui/client";
import { slugFromTitle } from "@/lib/ui/format";
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
  const [authors, setAuthors] = useState<{ id: string; displayName: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [transitioning, setTransitioning] = useState(false);
  const [gateErrors, setGateErrors] = useState<Record<string, string>>({});
  const [gateWarnings, setGateWarnings] = useState<FieldError[]>([]);
  const [revOpen, setRevOpen] = useState(false);

  // ── AI Write state ──────────────────────────────────────────────────────
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

  // Author profiles for the byline picker (non-blocking).
  useEffect(() => {
    let active = true;
    api
      .get<{ profiles: { id: string; displayName: string }[] }>(
        "/api/author-profiles"
      )
      .then((r) => active && setAuthors(r.profiles))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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
          categoryName: d.category.trim(),
          tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean),
          ...(d.authorProfileId ? { authorProfileId: d.authorProfileId } : {}),
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
    <>
      <EditorWorkspace
        item={item}
        draft={draft}
        update={update}
        gateErrors={gateErrors}
        gateWarnings={gateWarnings}
        contentId={contentId}
        initialSchema={schemaMarkupOf(item)}
        role={role}
        isOwner={isOwner}
        saveState={saveState}
        transitioning={transitioning}
        authors={authors}
        selection={selection}
        aiAssisted={aiAssisted}
        onEditorReady={handleEditorReady}
        onSaveDraft={() => persist("manual")}
        onTransition={transition}
        onAiInsert={handleAiInsert}
        onOpenHistory={() => setRevOpen(true)}
        onDelete={handleDelete}
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
    </>
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
    category: it.categoryName ?? "",
    tags: (it.tagNames ?? []).join(", "),
    authorProfileId: it.authorProfileId ?? null,
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
