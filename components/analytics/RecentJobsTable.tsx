"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import type { BadgeTone } from "@/lib/ui/format";
import { relativeTime } from "@/lib/ui/format";
import { usd, compact } from "./format";

interface RecentJob {
  id: string;
  mode: string;
  status: string;
  model: string | null;
  costUsd: number | null;
  totalTokens: number | null;
  lowGrounding: boolean;
  contentTitle: string | null;
  contentStatus: string | null;
  createdAt: string;
}

const MODE_LABEL: Record<string, string> = {
  FULL_DRAFT: "Full draft",
  SECTION: "Section",
  REWRITE: "Rewrite",
  OUTLINE: "Outline",
};

/** AiJobStatus -> badge tone + label (reuses the shared low-chroma tones). */
function jobStatusBadge(status: string): { tone: BadgeTone; label: string } {
  switch (status) {
    case "SUCCEEDED":
      return { tone: "published", label: "Succeeded" };
    case "FAILED":
      return { tone: "unpublished", label: "Failed" };
    case "CANCELLED":
      return { tone: "archived", label: "Cancelled" };
    case "STREAMING":
      return { tone: "scheduled", label: "Streaming" };
    case "QUEUED":
      return { tone: "draft", label: "Queued" };
    default:
      return { tone: "neutral", label: status };
  }
}

/** Newest-first feed of AI generation jobs with cost, tokens and target. */
export function RecentJobsTable({ jobs }: { jobs: RecentJob[] }) {
  return (
    <Card>
      <CardHeader title="Recent jobs" subtitle="Latest AI generations" />
      {jobs.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title="No AI jobs yet"
            description="Generations from the editor's AI Write will appear here."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-mute">
                <th className="px-5 py-2.5 font-medium">Target</th>
                <th className="px-5 py-2.5 font-medium">Mode</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 text-right font-medium">Tokens</th>
                <th className="px-5 py-2.5 text-right font-medium">Cost</th>
                <th className="px-5 py-2.5 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const sb = jobStatusBadge(j.status);
                return (
                  <tr
                    key={j.id}
                    className="border-b border-line last:border-0 hover:bg-paper-sunken/50"
                  >
                    <td className="max-w-[18rem] px-5 py-3">
                      <span className="block truncate text-ink">
                        {j.contentTitle ?? (
                          <span className="text-ink-mute">— no item —</span>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink-soft">
                      {MODE_LABEL[j.mode] ?? j.mode}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <Badge tone={sb.tone}>{sb.label}</Badge>
                        {j.lowGrounding ? (
                          <Badge tone="review">Verify facts</Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
                      {j.totalTokens != null ? compact(j.totalTokens) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
                      {j.costUsd != null ? usd(j.costUsd, { precise: true }) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-ink-mute">
                      {relativeTime(j.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
