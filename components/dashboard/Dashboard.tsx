"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loading, InlineError } from "@/components/ui/Feedback";
import { api, errorMessage } from "@/lib/ui/client";
import {
  contentTypePlural,
  formatDateTime,
  statusBadge,
} from "@/lib/ui/format";
import type { ContentItem } from "@/lib/ui/types";

interface ListResponse {
  items: ContentItem[];
  nextCursor: string | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Dashboard — workspace overview. Top KPI strip (published this week / total
 * published / drafts / scheduled) plus a recent activity table. Counts are
 * derived client-side from a generous recent window (the list API has no count
 * endpoint).
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

  const all = items ?? [];
  const now = Date.now();

  const totalPublished = all.filter((i) => i.status === "PUBLISHED").length;
  const publishedThisWeek = all.filter(
    (i) =>
      i.status === "PUBLISHED" &&
      i.publishedAt &&
      now - new Date(i.publishedAt).getTime() <= WEEK_MS
  ).length;
  const draftsInProgress = all.filter((i) => i.status === "DRAFT").length;
  const scheduled = all.filter((i) => i.status === "SCHEDULED").length;

  const recent = [...all]
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, 8);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What's happening across your content workspace"
        actions={
          <Link href="/content/new?type=BLOG">
            <Button variant="primary">
              <IconPlus /> New Blog Post
            </Button>
          </Link>
        }
      />
      <PageBody className="space-y-6">
        {error ? <InlineError message={error} /> : null}

        {items === null && !error ? (
          <Loading />
        ) : (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Published this week"
                value={publishedThisWeek}
                sub="items went live"
                icon={<IconTrend />}
                accent
              />
              <StatCard
                label="Total published"
                value={totalPublished}
                sub="live across all modules"
                icon={<IconCheck />}
              />
              <StatCard
                label="Drafts in progress"
                value={draftsInProgress}
                sub="waiting to be finished"
                icon={<IconPencil />}
              />
              <StatCard
                label="Scheduled"
                value={scheduled}
                sub="queued for auto-publish"
                icon={<IconCalendar />}
              />
            </div>

            {/* Recent activity */}
            <section>
              <h2 className="mb-3 text-base font-semibold text-ink">
                Recent activity
              </h2>
              <Card className="overflow-hidden">
                  {recent.length === 0 ? (
                    <p className="px-5 py-12 text-center text-sm text-ink-mute">
                      No content yet. Create your first item to get started.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full table-fixed text-sm">
                        <thead>
                          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-mute">
                            <th className="w-2/5 px-5 py-3 font-semibold">Title</th>
                            <th className="w-1/5 px-3 py-3 font-semibold">Module</th>
                            <th className="w-1/5 px-3 py-3 font-semibold">Status</th>
                            <th className="w-1/5 px-5 py-3 font-semibold">Updated</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {recent.map((item) => {
                            const meta = statusBadge(item.status);
                            return (
                              <tr
                                key={item.id}
                                className="transition-colors hover:bg-paper-sunken/50"
                              >
                                <td className="px-5 py-3.5">
                                  <Link
                                    href={`/content/${item.id}/edit`}
                                    className="block font-medium text-ink hover:underline"
                                  >
                                    {item.title || "Untitled"}
                                  </Link>
                                </td>
                                <td className="whitespace-nowrap px-3 py-3.5 text-ink-soft">
                                  {contentTypePlural(item.type)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-3.5">
                                  <Badge tone={meta.tone}>
                                    <IconDot /> {meta.label}
                                  </Badge>
                                </td>
                                <td className="whitespace-nowrap px-5 py-3.5 text-ink-mute">
                                  {formatDateTime(item.updatedAt)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </section>
          </>
        )}
      </PageBody>
    </>
  );
}

/* ── Stat card ──────────────────────────────────────────────────────────── */
function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper-raised p-5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink-soft">{label}</p>
        <span
          className={
            accent
              ? "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"
              : "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-paper-sunken text-ink-mute"
          }
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-ink">
        {value}
      </p>
      <p className="mt-1 text-xs text-ink-mute">{sub}</p>
    </div>
  );
}

/* ── Icons ──────────────────────────────────────────────────────────────── */
function Svg(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}
function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconTrend() {
  return <Svg><path d="m3 17 6-6 4 4 7-7" /><path d="M14 8h6v6" /></Svg>;
}
function IconCheck() {
  return <Svg><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></Svg>;
}
function IconPencil() {
  return <Svg><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>;
}
function IconCalendar() {
  return <Svg><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></Svg>;
}
function IconDot() {
  return (
    <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="4" r="3" />
    </svg>
  );
}
