"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Loading, InlineError } from "@/components/ui/Feedback";
import { AiAnalyticsSection } from "@/components/analytics/AiAnalyticsSection";
import { api, errorMessage } from "@/lib/ui/client";
import {
  CONTENT_STATUSES,
  contentTypeLabel,
  relativeTime,
  statusBadge,
} from "@/lib/ui/format";
import type { ContentItem, ContentStatus } from "@/lib/ui/types";

interface ListResponse {
  items: ContentItem[];
  nextCursor: string | null;
}

/**
 * Dashboard (P0): status counts + recent items. Counts are derived by fetching
 * a generous recent window and tallying client-side (the list API has no count
 * endpoint). The recent list links straight into the editor.
 *
 * Analytics merge: the former standalone /analytics page now lives here as the
 * <AiAnalyticsSection/> block rendered below the content overview. That block
 * owns its own fetch (/api/analytics/ai) and self-hides for roles without the
 * analytics capability (403), so the content dashboard above always renders.
 */
export function Dashboard() {
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api
      .get<ListResponse>("/api/content", { limit: 100 }, ac.signal)
      .then((r) => setItems(r.items))
      .catch((e) => {
        if (!ac.signal.aborted) setError(errorMessage(e));
      });
    return () => ac.abort();
  }, []);

  const counts = (items ?? []).reduce<Record<ContentStatus, number>>(
    (acc, it) => {
      acc[it.status] = (acc[it.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<ContentStatus, number>
  );

  const recent = (items ?? []).slice(0, 8);
  const reviewCount = counts.IN_REVIEW ?? 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your content and AI usage at a glance."
      />
      <PageBody className="space-y-6">
        {error ? <InlineError message={error} /> : null}

        {items === null && !error ? (
          <Loading />
        ) : (
          <>
            {/* Status counts */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {CONTENT_STATUSES.map((status) => {
                const meta = statusBadge(status);
                return (
                  <Link
                    key={status}
                    href={`/content?status=${status}`}
                    className="group rounded border border-line bg-paper-raised p-4 shadow-card transition-colors hover:border-line-strong"
                  >
                    <div className="text-2xl font-semibold text-ink tabular-nums">
                      {counts[status] ?? 0}
                    </div>
                    <div className="mt-1.5">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Review queue callout */}
            {reviewCount > 0 ? (
              <Card className="flex items-center justify-between gap-3 border-warn/30 bg-warn-soft px-5 py-3.5">
                <p className="text-sm text-ink">
                  <span className="font-semibold">{reviewCount}</span>{" "}
                  {reviewCount === 1 ? "item is" : "items are"} waiting for review.
                </p>
                <Link
                  href="/content?status=IN_REVIEW"
                  className="text-sm font-medium text-accent-ink underline underline-offset-2 hover:text-accent"
                >
                  Open review queue
                </Link>
              </Card>
            ) : null}

            {/* Recent items */}
            <Card>
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <h2 className="font-display text-base font-semibold">
                  Recently updated
                </h2>
                <Link
                  href="/content"
                  className="text-sm font-medium text-accent hover:text-accent-hover"
                >
                  View all
                </Link>
              </div>
              {recent.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-ink-mute">
                  No content yet. Create your first item from the Content page.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {recent.map((item) => {
                    const meta = statusBadge(item.status);
                    return (
                      <li key={item.id}>
                        <Link
                          href={`/content/${item.id}/edit`}
                          className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-paper-sunken/60"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink">
                              {item.title || "Untitled"}
                            </span>
                            <span className="text-xs text-ink-mute">
                              {contentTypeLabel(item.type)} · updated{" "}
                              {relativeTime(item.updatedAt)}
                            </span>
                          </span>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* AI analytics (merged from the former /analytics page). Self-hides
                for roles without the analytics capability. */}
            <div className="border-t border-line pt-6">
              <AiAnalyticsSection />
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
