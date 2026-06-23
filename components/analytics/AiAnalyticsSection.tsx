"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Loading, InlineError } from "@/components/ui/Feedback";
import { api, errorMessage, ApiError } from "@/lib/ui/client";
import type { AiAnalyticsPayload } from "@/lib/analytics/ai";
import { BudgetGauge } from "./BudgetGauge";
import { KpiCards } from "./KpiCards";
import { CostChart } from "./CostChart";
import { RecentJobsTable } from "./RecentJobsTable";
import { DateRangePicker } from "./DateRangePicker";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (d: Date) => `${MON[d.getMonth()]} ${d.getDate()}`;

/** Selectable lookback windows; `null` = all time. */
const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

/**
 * AI analytics block (FR-ANALYTICS), embedded in the Dashboard below the
 * content overview. Fetches /api/analytics/ai for the selected window and
 * renders the budget gauge, daily cost chart, KPI strip and recent-jobs table.
 *
 * The API enforces the Admin/Editor gate (view_audit_log). For roles without
 * that capability the fetch returns 403 — we treat that as "not authorized"
 * and render NOTHING (the dashboard above stays intact). Only genuine errors
 * (non-403) surface an inline error with a retry.
 */
export function AiAnalyticsSection() {
  const [rangeKey, setRangeKey] = useState("30d");
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [custom, setCustom] = useState<{ from: Date; to: Date } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [data, setData] = useState<AiAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Hidden when the viewer lacks the analytics capability (403). Once hidden we
  // never re-show within the session — the block simply isn't for this role.
  const [forbidden, setForbidden] = useState(false);

  const { fromIso, toIso } = useMemo<{
    fromIso: string | undefined;
    toIso: string | undefined;
  }>(() => {
    if (mode === "custom" && custom) {
      const { from, to } = custom;
      const start = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0));
      const end = new Date(Date.UTC(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59));
      return { fromIso: start.toISOString(), toIso: end.toISOString() };
    }
    const range = RANGES.find((r) => r.key === rangeKey);
    if (!range || range.days == null) return { fromIso: undefined, toIso: undefined };
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - range.days);
    return { fromIso: d.toISOString(), toIso: undefined };
  }, [mode, rangeKey, custom]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const query: Record<string, string> = {};
        if (fromIso) query.from = fromIso;
        if (toIso) query.to = toIso;
        const payload = await api.get<AiAnalyticsPayload>(
          "/api/analytics/ai",
          query,
          signal
        );
        setData(payload);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        // 403: the viewer can't see AI analytics — hide the whole block.
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true);
          return;
        }
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [fromIso, toIso]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Not authorized: render nothing, leaving the content dashboard untouched.
  if (forbidden) return null;

  // Initial load before we know whether the viewer is authorized: stay quiet
  // (a small loader) rather than flashing a heading that may then vanish.
  if (loading && !data) {
    return (
      <section className="space-y-4">
        <Loading label="Loading AI analytics…" />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            AI analytics
          </h2>
          <p className="text-sm text-ink-mute">
            Budget, usage, grounding and draft-acceptance metrics.
          </p>
        </div>
        <div className="relative flex items-center gap-2">
          <div className="inline-flex rounded-sm border border-line-strong bg-paper-raised p-0.5">
            {RANGES.map((r) => {
              const active = mode === "preset" && rangeKey === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => {
                    setMode("preset");
                    setRangeKey(r.key);
                    setPickerOpen(false);
                  }}
                  aria-pressed={active}
                  className={
                    active
                      ? "rounded-[3px] bg-accent-soft px-3 py-1 text-[13px] font-medium text-accent-ink"
                      : "rounded-[3px] px-3 py-1 text-[13px] font-medium text-ink-soft hover:bg-paper-sunken hover:text-ink"
                  }
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          {/* Custom range */}
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            aria-expanded={pickerOpen}
            className={[
              "inline-flex items-center gap-1.5 rounded-sm border px-3 py-1 text-[13px] font-medium transition-colors",
              mode === "custom"
                ? "border-accent/30 bg-accent-soft text-accent-ink"
                : "border-line-strong bg-paper-raised text-ink-soft hover:bg-paper-sunken hover:text-ink",
            ].join(" ")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" />
            </svg>
            {mode === "custom" && custom
              ? `${shortDate(custom.from)} – ${shortDate(custom.to)}`
              : "Custom"}
          </button>

          {pickerOpen ? (
            <DateRangePicker
              initialFrom={custom?.from ?? null}
              initialTo={custom?.to ?? null}
              onApply={(f, t) => {
                setCustom({ from: f, to: t });
                setMode("custom");
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
            />
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="space-y-3">
          <InlineError message={error} />
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : data ? (
        <>
          {/* Live current-month budget (independent of the window filter). */}
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <BudgetGauge budget={data.summary.budget} />
            </div>
            <div className="lg:col-span-2">
              <CostChart data={data.costOverTime} />
            </div>
          </div>

          <KpiCards
            summary={data.summary}
            grounding={data.grounding}
            acceptance={data.acceptance}
          />

          <RecentJobsTable jobs={data.recentJobs} />
        </>
      ) : null}
    </section>
  );
}
