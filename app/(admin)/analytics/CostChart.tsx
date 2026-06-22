"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { usd, dayLabel } from "./format";

interface CostBucket {
  date: string;
  jobs: number;
  costUsd: number;
}

/**
 * Cost-over-time mini chart. Pure CSS/SVG-free bar chart (no chart dependency,
 * per the bundle-budget constraint). Bars scale to the max-cost day; hover
 * title exposes the exact figures for accessibility.
 */
export function CostChart({ data }: { data: CostBucket[] }) {
  const max = data.reduce((m, b) => Math.max(m, b.costUsd), 0);
  // Cap the rendered count so a long all-time window stays readable.
  const buckets = data.slice(-30);

  return (
    <Card>
      <CardHeader
        title="Cost over time"
        subtitle="Daily AI spend (UTC)"
      />
      <div className="p-5">
        {buckets.length === 0 ? (
          <EmptyState
            title="No usage yet"
            description="AI generation cost will appear here once jobs run."
          />
        ) : (
          <div
            className="flex h-44 items-end gap-1.5"
            role="img"
            aria-label="Daily AI spend bar chart"
          >
            {buckets.map((b) => {
              const heightPct = max > 0 ? Math.max(2, (b.costUsd / max) * 100) : 2;
              return (
                <div
                  key={b.date}
                  className="group flex min-w-0 flex-1 flex-col items-center justify-end"
                  title={`${dayLabel(b.date)} — ${usd(b.costUsd, { precise: true })} · ${b.jobs} job${b.jobs === 1 ? "" : "s"}`}
                >
                  <div
                    className="w-full rounded-t-sm bg-accent/70 transition-colors group-hover:bg-accent"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
              );
            })}
          </div>
        )}
        {buckets.length > 0 ? (
          <div className="mt-2 flex items-center justify-between text-[11px] text-ink-mute">
            <span>{dayLabel(buckets[0].date)}</span>
            <span>peak {usd(max, { precise: true })}</span>
            <span>{dayLabel(buckets[buckets.length - 1].date)}</span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
