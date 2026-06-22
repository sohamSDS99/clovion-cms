"use client";

import { useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Field";
import { Loading, InlineError, EmptyState } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/ui/client";
import { formatDateTime, relativeTime } from "@/lib/ui/format";
import { diffRevisions, type RevisionDiff } from "@/lib/editor/diff";
import type { ContentItem, ContentRevision } from "@/lib/ui/types";

/**
 * Revision history drawer (FR-CONTENT-10): list revisions newest-first and
 * restore one (creates a new MANUAL revision server-side). On restore the
 * parent reloads the item so the editor reflects the snapshot.
 *
 * Adds a "Compare" mode: pick two revisions and render a line-level body diff
 * (added in accent, removed in danger/strikethrough, unchanged muted) plus a
 * list of changed SEO / typeData fields. Diff is color-coded *and* prefixed
 * with +/- markers so it is not color-only (WCAG).
 */
export function RevisionDrawer({
  open,
  onClose,
  contentId,
  currentRevisionId,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  contentId: string;
  currentRevisionId: string | null;
  onRestored: (item: ContentItem) => void;
}) {
  const toast = useToast();
  const [revisions, setRevisions] = useState<ContentRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  // View mode + the two revision ids selected for comparison.
  const [mode, setMode] = useState<"list" | "compare">("list");
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRevisions(null);
    setError(null);
    setMode("list");
    api
      .get<{ items: ContentRevision[] }>(`/api/content/${contentId}/revisions`)
      .then((r) => setRevisions(r.items))
      .catch((e) => setError(errorMessage(e)));
  }, [open, contentId]);

  // Default the comparison to "previous (before) vs current/newest (after)"
  // whenever the revisions load. Revisions are newest-first.
  useEffect(() => {
    if (!revisions || revisions.length === 0) return;
    const after = revisions[0];
    const before = revisions[1] ?? revisions[0];
    setAfterId((prev) => prev ?? after.id);
    setBeforeId((prev) => prev ?? before.id);
  }, [revisions]);

  async function restore(revisionId: string) {
    setRestoring(revisionId);
    try {
      const item = await api.post<ContentItem>(
        `/api/content/${contentId}/revisions`,
        { revisionId }
      );
      toast.success("Revision restored.");
      onRestored(item);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRestoring(null);
    }
  }

  const sourceLabel: Record<ContentRevision["source"], string> = {
    MANUAL: "Manual save",
    AUTOSAVE: "Autosave",
    AI_GENERATION: "AI draft",
  };

  const byId = useMemo(() => {
    const map = new Map<string, ContentRevision>();
    revisions?.forEach((r) => map.set(r.id, r));
    return map;
  }, [revisions]);

  // Compute the diff for the two selected revisions. `before` is the older
  // baseline, `after` is the newer/target snapshot.
  const diff: RevisionDiff | null = useMemo(() => {
    if (mode !== "compare" || !beforeId || !afterId) return null;
    const before = byId.get(beforeId);
    const after = byId.get(afterId);
    if (!before || !after) return null;
    // diffRevisions only reads keys; SeoData is a specific interface (no index
    // signature) so we widen to the structural Record the differ expects.
    return diffRevisions(
      {
        body: before.body,
        seo: before.seo as Record<string, unknown>,
        typeData: before.typeData as Record<string, unknown>,
      },
      {
        body: after.body,
        seo: after.seo as Record<string, unknown>,
        typeData: after.typeData as Record<string, unknown>,
      }
    );
  }, [mode, beforeId, afterId, byId]);

  function revisionOptionLabel(rev: ContentRevision): string {
    const tag = rev.id === currentRevisionId ? " — current" : "";
    return `${sourceLabel[rev.source]} · ${relativeTime(rev.createdAt)}${tag}`;
  }

  const hasBodyChanges = diff?.body.some((l) => l.type !== "same") ?? false;

  return (
    <Drawer open={open} onClose={onClose} title="Revision history">
      {error ? <InlineError message={error} /> : null}

      {revisions === null && !error ? (
        <Loading />
      ) : revisions && revisions.length === 0 ? (
        <EmptyState title="No revisions yet" />
      ) : (
        <>
          {/* Mode toggle */}
          <div className="mb-3 flex items-center gap-1" role="tablist" aria-label="Revision view">
            <Button
              variant={mode === "list" ? "secondary" : "ghost"}
              size="sm"
              role="tab"
              aria-selected={mode === "list"}
              onClick={() => setMode("list")}
            >
              History
            </Button>
            <Button
              variant={mode === "compare" ? "secondary" : "ghost"}
              size="sm"
              role="tab"
              aria-selected={mode === "compare"}
              onClick={() => setMode("compare")}
              disabled={(revisions?.length ?? 0) < 1}
            >
              Compare
            </Button>
          </div>

          {mode === "list" ? (
            <ul className="space-y-2">
              {revisions?.map((rev) => {
                const isCurrent = rev.id === currentRevisionId;
                return (
                  <li
                    key={rev.id}
                    className="rounded-sm border border-line bg-paper-raised p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge tone={rev.source === "AUTOSAVE" ? "neutral" : "accent"}>
                            {sourceLabel[rev.source]}
                          </Badge>
                          {isCurrent ? (
                            <span className="text-xs font-medium text-accent">Current</span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-xs text-ink-soft" title={formatDateTime(rev.createdAt)}>
                          {relativeTime(rev.createdAt)}
                        </p>
                        {rev.revisionNote ? (
                          <p className="mt-1 text-xs text-ink-mute">{rev.revisionNote}</p>
                        ) : null}
                      </div>
                      {!isCurrent ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={restoring === rev.id}
                          onClick={() => restore(rev.id)}
                        >
                          Restore
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <CompareView
              revisions={revisions ?? []}
              beforeId={beforeId}
              afterId={afterId}
              onBefore={setBeforeId}
              onAfter={setAfterId}
              optionLabel={revisionOptionLabel}
              diff={diff}
              hasBodyChanges={hasBodyChanges}
              currentRevisionId={currentRevisionId}
              restoring={restoring}
              onRestore={restore}
            />
          )}
        </>
      )}
    </Drawer>
  );
}

/** Compare-mode body: revision pickers + body diff + field-change lists. */
function CompareView({
  revisions,
  beforeId,
  afterId,
  onBefore,
  onAfter,
  optionLabel,
  diff,
  hasBodyChanges,
  currentRevisionId,
  restoring,
  onRestore,
}: {
  revisions: ContentRevision[];
  beforeId: string | null;
  afterId: string | null;
  onBefore: (id: string) => void;
  onAfter: (id: string) => void;
  optionLabel: (rev: ContentRevision) => string;
  diff: RevisionDiff | null;
  hasBodyChanges: boolean;
  currentRevisionId: string | null;
  restoring: string | null;
  onRestore: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Select
          label="Before"
          value={beforeId ?? ""}
          onChange={(e) => onBefore(e.target.value)}
        >
          {revisions.map((rev) => (
            <option key={rev.id} value={rev.id}>
              {optionLabel(rev)}
            </option>
          ))}
        </Select>
        <Select
          label="After"
          value={afterId ?? ""}
          onChange={(e) => onAfter(e.target.value)}
        >
          {revisions.map((rev) => (
            <option key={rev.id} value={rev.id}>
              {optionLabel(rev)}
            </option>
          ))}
        </Select>
      </div>

      {beforeId && afterId && beforeId === afterId ? (
        <p className="text-xs text-ink-mute">
          Select two different revisions to see changes.
        </p>
      ) : null}

      {/* Body diff */}
      <section aria-label="Body changes">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Body
        </h3>
        {!diff ? null : !hasBodyChanges ? (
          <p className="text-xs text-ink-mute">No body changes.</p>
        ) : (
          <div className="overflow-hidden rounded-sm border border-line bg-paper-raised font-mono text-xs">
            {diff.body.map((line, i) => (
              <DiffLineRow key={i} type={line.type} text={line.text} />
            ))}
          </div>
        )}
      </section>

      {/* SEO field changes */}
      <FieldChangeList title="SEO" changes={diff?.seoChanged ?? []} />

      {/* typeData field changes */}
      <FieldChangeList title="Type fields" changes={diff?.typeDataChanged ?? []} />

      {/* Restore the "before" revision (the baseline being viewed). */}
      {beforeId && beforeId !== currentRevisionId ? (
        <div className="border-t border-line pt-3">
          <Button
            variant="secondary"
            size="sm"
            loading={restoring === beforeId}
            onClick={() => onRestore(beforeId)}
          >
            Restore “Before” revision
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A single diff line. Color is accent (added) / danger (removed) / muted
 * (same), but each line is also prefixed with a +/- / space marker so meaning
 * never relies on color alone.
 */
function DiffLineRow({
  type,
  text,
}: {
  type: "same" | "added" | "removed";
  text: string;
}) {
  const marker = type === "added" ? "+" : type === "removed" ? "-" : " ";
  const cls =
    type === "added"
      ? "text-accent"
      : type === "removed"
      ? "text-danger line-through"
      : "text-ink-mute";
  const bg =
    type === "added"
      ? "bg-accent/10"
      : type === "removed"
      ? "bg-danger/10"
      : undefined;
  const label =
    type === "added" ? "added" : type === "removed" ? "removed" : undefined;

  return (
    <div className={`flex gap-2 px-2 py-0.5 ${bg ?? ""}`.trim()}>
      <span aria-hidden className={`select-none ${cls}`}>
        {marker}
      </span>
      {label ? <span className="sr-only">{label}: </span> : null}
      <span className={`whitespace-pre-wrap break-words ${cls}`}>
        {text === "" ? " " : text}
      </span>
    </div>
  );
}

/** List of changed scalar fields (SEO or typeData) with before/after values. */
function FieldChangeList({
  title,
  changes,
}: {
  title: string;
  changes: { field: string; before: string | null; after: string | null }[];
}) {
  if (changes.length === 0) return null;
  return (
    <section aria-label={`${title} changes`}>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {changes.map((c) => (
          <li
            key={c.field}
            className="rounded-sm border border-line bg-paper-raised p-2 text-xs"
          >
            <div className="font-medium text-ink">{c.field}</div>
            <div className="mt-0.5 flex flex-col gap-0.5">
              <span className="text-danger">
                <span aria-hidden>- </span>
                <span className="sr-only">before: </span>
                {c.before ?? <em className="text-ink-mute not-italic">(empty)</em>}
              </span>
              <span className="text-accent">
                <span aria-hidden>+ </span>
                <span className="sr-only">after: </span>
                {c.after ?? <em className="text-ink-mute not-italic">(empty)</em>}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
