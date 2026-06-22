"use client";

import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, InlineError, Loading } from "@/components/ui/Feedback";
import { api, errorMessage } from "@/lib/ui/client";
import { cn } from "@/lib/ui/cn";
import { formatDateTime, relativeTime } from "@/lib/ui/format";
import type { AuditEntry } from "@/lib/ui/types";

interface ListResponse {
  items: AuditEntry[];
  nextCursor: string | null;
}

const ENTITY_TYPES = ["", "content", "media", "sop", "config", "user", "kb", "author_profile"];

/** Audit log table (FR-USER-04). Admin/Editor only (gated by API + nav). */
export function AuditLog() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entityType, setEntityType] = useState("");

  const load = useCallback(
    async (c: string | null, signal?: AbortSignal) =>
      api.get<ListResponse>(
        "/api/audit",
        { entityType: entityType || undefined, limit: 50, cursor: c || undefined },
        signal
      ),
    [entityType]
  );

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    load(null, ac.signal)
      .then((r) => {
        setItems(r.items);
        setCursor(r.nextCursor);
      })
      .catch((e) => !ac.signal.aborted && setError(errorMessage(e)))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [load]);

  async function loadMore() {
    if (!cursor) return;
    setMore(true);
    try {
      const r = await load(cursor);
      setItems((p) => [...p, ...r.items]);
      setCursor(r.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setMore(false);
    }
  }

  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of every change." />
      <PageBody className="space-y-4">
        <div className="flex gap-1">
          {ENTITY_TYPES.map((t) => (
            <button
              key={t || "all"}
              onClick={() => setEntityType(t)}
              className={cn(
                "rounded-sm border px-3 py-1.5 text-sm capitalize transition-colors",
                entityType === t
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-line-strong text-ink-soft hover:bg-paper-sunken"
              )}
            >
              {t.replace("_", " ") || "All"}
            </button>
          ))}
        </div>

        {error ? <InlineError message={error} /> : null}

        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState title="No audit entries" />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {items.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-5 py-3">
                  <Badge tone="neutral">{entry.entityType}</Badge>
                  <span className="font-medium text-ink">{entry.action.replace(/_/g, " ")}</span>
                  <span className="hidden truncate text-xs text-ink-faint sm:inline">
                    {entry.entityId}
                  </span>
                  <span className="ml-auto whitespace-nowrap text-xs text-ink-mute" title={formatDateTime(entry.at)}>
                    {relativeTime(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {cursor ? (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={loadMore} loading={more}>
              Load more
            </Button>
          </div>
        ) : null}
      </PageBody>
    </>
  );
}
