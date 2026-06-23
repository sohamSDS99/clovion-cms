"use client";

import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/ui/cn";
import { usd, int, compact, pct } from "./format";

interface Summary {
  totalJobs: number;
  succeeded: number;
  failed: number;
  totalTokens: number;
  totalCostUsd: number;
  avgCostPerJob: number;
}
interface Grounding {
  lowGroundingRate: number;
  succeededJobs: number;
}
interface Acceptance {
  acceptanceRate: number;
  publishedItems: number;
  draftedItems: number;
}

/** A single KPI tile. */
function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "danger";
}) {
  const valueColor =
    tone === "danger"
      ? "text-danger"
      : tone === "warn"
        ? "text-warn"
        : tone === "ok"
          ? "text-accent-ink"
          : "text-ink";
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-mute">
        {label}
      </p>
      <p className={cn("mt-1.5 font-display text-2xl font-semibold tracking-tight", valueColor)}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-mute">{hint}</p> : null}
    </Card>
  );
}

/**
 * The KPI strip: jobs, tokens, total cost, avg cost, grounding ("verify facts")
 * rate, and the AI-draft acceptance rate (PRD ≥60% target colors the tile).
 */
export function KpiCards({
  summary,
  grounding,
  acceptance,
}: {
  summary: Summary;
  grounding: Grounding;
  acceptance: Acceptance;
}) {
  // Lower grounding-flag rate is better; warn once a meaningful share needs
  // fact-checking. Acceptance: green at/above the 60% PRD target.
  const groundingTone =
    grounding.lowGroundingRate >= 40
      ? "danger"
      : grounding.lowGroundingRate >= 20
        ? "warn"
        : "ok";
  const acceptanceTone =
    acceptance.draftedItems === 0
      ? undefined
      : acceptance.acceptanceRate >= 60
        ? "ok"
        : acceptance.acceptanceRate >= 40
          ? "warn"
          : "danger";

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <Kpi
        label="Total jobs"
        value={int(summary.totalJobs)}
        hint={`${int(summary.succeeded)} ok · ${int(summary.failed)} failed`}
      />
      <Kpi
        label="Tokens"
        value={compact(summary.totalTokens)}
        hint="prompt + completion"
      />
      <Kpi
        label="Total cost"
        value={usd(summary.totalCostUsd)}
        hint="in window"
      />
      <Kpi
        label="Avg / job"
        value={usd(summary.avgCostPerJob, { precise: true })}
        hint="mean cost"
      />
      <Kpi
        label="Verify-facts rate"
        value={pct(grounding.lowGroundingRate)}
        hint={`${int(grounding.succeededJobs)} drafts`}
        tone={groundingTone}
      />
      <Kpi
        label="Draft acceptance"
        value={pct(acceptance.acceptanceRate)}
        hint={`${int(acceptance.publishedItems)}/${int(acceptance.draftedItems)} published`}
        tone={acceptanceTone}
      />
    </div>
  );
}
