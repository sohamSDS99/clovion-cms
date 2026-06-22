"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, InlineError, Loading } from "@/components/ui/Feedback";
import { NewContentButton } from "./NewContentButton";
import { api, errorMessage } from "@/lib/ui/client";
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  contentTypeLabel,
  relativeTime,
  statusBadge,
} from "@/lib/ui/format";
import { cn } from "@/lib/ui/cn";
import type { ContentItem, ContentStatus, ContentType } from "@/lib/ui/types";

interface ListResponse {
  items: ContentItem[];
  nextCursor: string | null;
}

/**
 * Content browse + filter + search + review queue (FR-CONTENT). Filter state is
 * mirrored to the URL so deep links (e.g. /content?status=IN_REVIEW from the
 * dashboard review callout) work and are shareable.
 */
export function ContentList() {
  const router = useRouter();
  const params = useSearchParams();

  const typeParam = (params.get("type") as ContentType | null) ?? "";
  const statusParam = (params.get("status") as ContentStatus | null) ?? "";
  const qParam = params.get("q") ?? "";

  const [items, setItems] = useState<ContentItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(qParam);

  const reviewMode = statusParam === "IN_REVIEW";

  // Keep the search box in sync if navigated to with a ?q.
  useEffect(() => setSearch(qParam), [qParam]);

  const setFilter = useCallback(
    (key: "type" | "status" | "q", value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`/content${next.toString() ? `?${next}` : ""}`);
    },
    [params, router]
  );

  const load = useCallback(
    async (cursor: string | null, signal?: AbortSignal) => {
      const res = await api.get<ListResponse>(
        "/api/content",
        {
          type: typeParam || undefined,
          status: statusParam || undefined,
          q: qParam || undefined,
          limit: 25,
          cursor: cursor || undefined,
        },
        signal
      );
      return res;
    },
    [typeParam, statusParam, qParam]
  );

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    load(null, ac.signal)
      .then((r) => {
        setItems(r.items);
        setNextCursor(r.nextCursor);
      })
      .catch((e) => !ac.signal.aborted && setError(errorMessage(e)))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const r = await load(nextCursor);
      setItems((prev) => [...prev, ...r.items]);
      setNextCursor(r.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  // Debounced search submit.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearchChange(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setFilter("q", value.trim()), 350);
  }

  return (
    <>
      <PageHeader
        title={reviewMode ? "Review queue" : "Content"}
        description={
          reviewMode
            ? "Items submitted and awaiting an editorial decision."
            : "All content across every type and lifecycle stage."
        }
        actions={<NewContentButton />}
      />
      <PageBody className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search title or excerpt…"
              aria-label="Search content"
              className="h-10 w-full rounded-sm border border-line-strong bg-paper-raised pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </div>

          <FilterChips
            label="Type"
            value={typeParam}
            options={CONTENT_TYPES.map((t) => ({ value: t, label: contentTypeLabel(t) }))}
            onChange={(v) => setFilter("type", v)}
          />
          <FilterChips
            label="Status"
            value={statusParam}
            options={CONTENT_STATUSES.map((s) => ({ value: s, label: statusBadge(s).label }))}
            onChange={(v) => setFilter("status", v)}
          />
        </div>

        {error ? <InlineError message={error} /> : null}

        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            title={reviewMode ? "Nothing to review" : "No content found"}
            description={
              typeParam || statusParam || qParam
                ? "Try clearing your filters."
                : "Create your first content item to get started."
            }
            action={!reviewMode ? <NewContentButton /> : undefined}
          />
        ) : (
          <Card className="overflow-hidden">
            {/* Header row (desktop) */}
            <div className="hidden grid-cols-[1fr_120px_120px_140px] gap-3 border-b border-line px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-faint sm:grid">
              <span>Title</span>
              <span>Type</span>
              <span>Status</span>
              <span>Updated</span>
            </div>
            <ul className="divide-y divide-line">
              {items.map((item) => {
                const meta = statusBadge(item.status);
                return (
                  <li key={item.id}>
                    <Link
                      href={`/content/${item.id}/edit`}
                      className="grid grid-cols-1 gap-1 px-5 py-3.5 transition-colors hover:bg-paper-sunken/50 sm:grid-cols-[1fr_120px_120px_140px] sm:items-center sm:gap-3"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">
                          {item.title || "Untitled"}
                        </span>
                        <span className="truncate text-xs text-ink-mute">
                          /{item.slug}
                        </span>
                      </span>
                      <span className="text-sm text-ink-soft">
                        {contentTypeLabel(item.type)}
                      </span>
                      <span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </span>
                      <span className="text-sm text-ink-mute">
                        {relativeTime(item.updatedAt)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {nextCursor ? (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
              Load more
            </Button>
          </div>
        ) : null}
      </PageBody>
    </>
  );
}

/** A segmented filter control with an "All" reset. */
function FilterChips({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <select
        aria-label={`Filter by ${label.toLowerCase()}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-10 cursor-pointer rounded-sm border bg-paper-raised px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
          value ? "border-accent/40 text-accent-ink" : "border-line-strong text-ink-soft"
        )}
      >
        <option value="">All {label.toLowerCase()}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
