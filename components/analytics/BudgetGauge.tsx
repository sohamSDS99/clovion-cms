"use client";

import { cn } from "@/lib/ui/cn";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/lib/ui/format";
import { usd, pct } from "./format";

interface BudgetView {
  spentUsd: number;
  budgetUsd: number | null;
  exceeded: boolean;
}

/**
 * Current-month spend vs configured budget. Pure CSS bar (no chart dep).
 * Tones: ok < 80%, near 80–100% (warn), over >100% (danger / exceeded).
 */
export function BudgetGauge({ budget }: { budget: BudgetView }) {
  const { spentUsd, budgetUsd, exceeded } = budget;
  const hasBudget = budgetUsd != null && budgetUsd > 0;
  const ratio = hasBudget ? spentUsd / (budgetUsd as number) : 0;
  const fillPct = Math.min(100, Math.max(0, ratio * 100));

  const tone: "ok" | "near" | "over" = exceeded || ratio > 1
    ? "over"
    : ratio >= 0.8
      ? "near"
      : "ok";

  const barColor =
    tone === "over" ? "bg-danger" : tone === "near" ? "bg-warn" : "bg-accent";

  const badge: { tone: BadgeTone; label: string } =
    tone === "over"
      ? { tone: "unpublished", label: "Over budget" }
      : tone === "near"
        ? { tone: "review", label: "Approaching limit" }
        : { tone: "published", label: "On track" };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-mute">
            Monthly AI spend
          </p>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
            {usd(spentUsd)}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {hasBudget
              ? `of ${usd(budgetUsd as number)} budget`
              : "No monthly budget set"}
          </p>
        </div>
        {hasBudget ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
      </div>

      {hasBudget ? (
        <div className="mt-4">
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-paper-sunken"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={budgetUsd as number}
            aria-valuenow={spentUsd}
            aria-label="Monthly AI spend versus budget"
          >
            <div
              className={cn("h-full rounded-full transition-all", barColor)}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-ink-mute">
            <span>{pct(ratio * 100)} used</span>
            <span>
              {ratio <= 1
                ? `${usd((budgetUsd as number) - spentUsd)} left`
                : `${usd(spentUsd - (budgetUsd as number))} over`}
            </span>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
