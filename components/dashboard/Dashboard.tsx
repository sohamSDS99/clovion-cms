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
  contentTypeLabel,
  contentTypePlural,
  CONTENT_TYPE_ORDER,
  formatDateTime,
  statusBadge,
} from "@/lib/ui/format";
import type { ContentItem, ContentType } from "@/lib/ui/types";

interface ListResponse {
  items: ContentItem[];
  nextCursor: string | null;
}

interface LeadFormsResponse {
  forms: { _count?: { submissions?: number } }[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Content types offered in the "Quick create" grid (matches the marketing IA). */
const QUICK_CREATE: ContentType[] = ["BLOG", "NEWS", "RESOURCE", "FAQ"];

/**
 * Dashboard — workspace overview. Top KPI strip (published this week / total
 * published / drafts / scheduled), a Modules + Quick-create rail, and a recent
 * activity table. Counts are derived client-side from a generous recent window
 * (the list API has no count endpoint).
 */
export function Dashboard() {
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [downloads, setDownloads] = useState<number | null>(null);
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

  // Resource downloads = lead-form submissions. Admin/Editor only; silently
  // stays null (rendered as "—") for roles without access or on any error.
  useEffect(() => {
    const ac = new AbortController();
    api
      .get<LeadFormsResponse>("/api/leadforms", undefined, ac.signal)
      .then((r) =>
        setDownloads(
          r.forms.reduce((sum, f) => sum + (f._count?.submissions ?? 0), 0)
        )
      )
      .catch(() => {
        /* not authorized / unavailable — leave as null */
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

  const countByType = (type: ContentType) =>
    all.filter((i) => i.type === type).length;

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

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              {/* Left rail — Modules + Quick create */}
              <div className="space-y-6 lg:col-span-2">
                <section>
                  <h2 className="mb-3 text-base font-semibold text-ink">
                    Modules
                  </h2>
                  <div className="space-y-3">
                    {CONTENT_TYPE_ORDER.map((type) => (
                      <Link
                        key={type}
                        href={`/content?type=${type}`}
                        className="group flex items-center gap-3 rounded-xl border border-line bg-paper-raised p-4 shadow-card transition-colors hover:border-line-strong"
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-paper-sunken text-ink-soft">
                          {typeIcon(type)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-ink">
                            {contentTypePlural(type)}
                          </p>
                          <p className="text-xs text-ink-mute">
                            {countByType(type)}{" "}
                            {countByType(type) === 1 ? "item" : "items"}
                          </p>
                        </div>
                        <span className="text-ink-faint transition-colors group-hover:text-ink-soft">
                          <IconArrowUpRight />
                        </span>
                      </Link>
                    ))}

                    {/* Resource downloads */}
                    <div className="flex items-center gap-3 rounded-xl border border-line bg-paper-raised p-4 shadow-card">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-paper-sunken text-ink-soft">
                        <IconDownload />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">
                          Resource downloads
                        </p>
                        <p className="text-xs text-ink-mute">
                          all-time, across published resources
                        </p>
                      </div>
                      <span className="text-lg font-semibold tabular-nums text-ink">
                        {downloads ?? "—"}
                      </span>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="mb-3 text-base font-semibold text-ink">
                    Quick create
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    {QUICK_CREATE.map((type) => (
                      <Link
                        key={type}
                        href={`/content/new?type=${type}`}
                        className="flex items-center gap-2.5 rounded-xl border border-line bg-paper-raised px-4 py-3 text-sm font-medium text-ink shadow-card transition-colors hover:border-line-strong hover:bg-paper-sunken"
                      >
                        <span className="text-ink-soft">{typeIcon(type)}</span>
                        {quickLabel(type)}
                      </Link>
                    ))}
                  </div>
                </section>
              </div>

              {/* Right — Recent activity */}
              <section className="lg:col-span-3">
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
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-mute">
                            <th className="px-5 py-3 font-semibold">Title</th>
                            <th className="px-3 py-3 font-semibold">Module</th>
                            <th className="px-3 py-3 font-semibold">Status</th>
                            <th className="px-5 py-3 font-semibold">Updated</th>
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
                                <td className="max-w-0 px-5 py-3.5">
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
            </div>
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

/* ── Helpers ────────────────────────────────────────────────────────────── */
function quickLabel(type: ContentType): string {
  switch (type) {
    case "BLOG":
      return "Blog Post";
    case "NEWS":
      return "News Article";
    case "RESOURCE":
      return "Resource";
    case "FAQ":
      return "FAQ Article";
    default:
      return contentTypeLabel(type);
  }
}

function typeIcon(type: ContentType): React.ReactNode {
  switch (type) {
    case "BLOG":
      return <IconDoc />;
    case "WEBINAR":
      return <IconVideo />;
    case "NEWS":
      return <IconNews />;
    case "RESOURCE":
      return <IconDownload />;
    case "FAQ":
      return <IconHelp />;
    default:
      return <IconDoc />;
  }
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
function IconDoc() {
  return <Svg><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /><path d="M9 13h6M9 17h6" /></Svg>;
}
function IconVideo() {
  return <Svg><rect x="2" y="5" width="14" height="14" rx="2" /><path d="m16 9 6-3v12l-6-3z" /></Svg>;
}
function IconNews() {
  return <Svg><path d="M4 4h13v16H6a2 2 0 0 1-2-2z" /><path d="M17 8h3v10a2 2 0 0 1-2 2" /><path d="M8 8h5M8 12h5M8 16h5" /></Svg>;
}
function IconHelp() {
  return <Svg><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7" /><path d="M12 17h.01" /></Svg>;
}
function IconDownload() {
  return <Svg><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /><path d="M12 3v11" /><path d="m8 10 4 4 4-4" /></Svg>;
}
function IconArrowUpRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}
function IconDot() {
  return (
    <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="4" r="3" />
    </svg>
  );
}
