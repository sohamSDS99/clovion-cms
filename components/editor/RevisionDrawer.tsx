"use client";

import { useEffect, useState } from "react";
import { Drawer } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Loading, InlineError, EmptyState } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/ui/client";
import { formatDateTime, relativeTime } from "@/lib/ui/format";
import type { ContentItem, ContentRevision } from "@/lib/ui/types";

/**
 * Revision history drawer (FR-CONTENT-10): list revisions newest-first and
 * restore one (creates a new MANUAL revision server-side). On restore the
 * parent reloads the item so the editor reflects the snapshot.
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

  useEffect(() => {
    if (!open) return;
    setRevisions(null);
    setError(null);
    api
      .get<{ items: ContentRevision[] }>(`/api/content/${contentId}/revisions`)
      .then((r) => setRevisions(r.items))
      .catch((e) => setError(errorMessage(e)));
  }, [open, contentId]);

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

  return (
    <Drawer open={open} onClose={onClose} title="Revision history">
      {error ? <InlineError message={error} /> : null}
      {revisions === null && !error ? (
        <Loading />
      ) : revisions && revisions.length === 0 ? (
        <EmptyState title="No revisions yet" />
      ) : (
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
      )}
    </Drawer>
  );
}
