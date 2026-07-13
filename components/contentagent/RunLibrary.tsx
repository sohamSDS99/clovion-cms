"use client";

/**
 * Content Agent — Library: every past run, with status, polling for active
 * ones, and deletion of finished runs.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AgentRun } from "@prisma/client";
import { PageHeader, PageBody } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Loading, InlineError, EmptyState } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/ui/client";
import { CHANNELS } from "@/lib/contentagent/channels";
import { runStatusTone, runStatusLabel } from "./runStatus";

export function RunLibrary() {
  const router = useRouter();
  const toast = useToast();
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const loadRuns = useCallback(async (cursor?: string) => {
    try {
      const res = await api.get<{
        data: AgentRun[];
        pagination: { nextCursor: string | null };
      }>("/api/content-agent/runs", cursor ? { cursor } : undefined);
      setRuns((prev) => (cursor && prev ? [...prev, ...res.data] : res.data));
      setNextCursor(res.pagination.nextCursor);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    const active = runs?.some((r) => !["READY", "FAILED", "CANCELLED"].includes(r.status));
    if (!active) return;
    const t = setInterval(() => void loadRuns(), 4000);
    return () => clearInterval(t);
  }, [runs, loadRuns]);

  return (
    <>
      <PageHeader
        title="Library"
        description="Everything the agents have generated — drafts, QA verdicts, and what shipped."
        actions={
          <Link href="/content-agent">
            <Button size="sm">New generation</Button>
          </Link>
        }
      />
      <PageBody>
        <Card className="mx-auto max-w-3xl">
          <div className="p-4">
            {loadError ? <InlineError message={loadError} /> : null}
            {runs === null ? (
              <Loading label="Loading runs…" />
            ) : runs.length === 0 ? (
              <EmptyState
                title="No runs yet"
                description="Start a generation and every run will be kept here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {runs.map((run) => {
                  const chan = CHANNELS.find((c) => c.id === run.channel);
                  const deletable = ["READY", "FAILED", "CANCELLED"].includes(run.status);
                  return (
                    <li key={run.id} className="flex items-center gap-1">
                      <button
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 px-1 py-3 text-left hover:bg-paper-sunken"
                        onClick={() => router.push(`/content-agent/${run.id}`)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">
                            {run.brief}
                          </span>
                          <span className="mt-0.5 block text-xs text-ink-mute">
                            {chan?.label ?? run.channel} ·{" "}
                            {new Date(run.createdAt).toLocaleString()}
                          </span>
                        </span>
                        {run.approvedAt ? (
                          <Badge tone="published">Approved</Badge>
                        ) : (
                          <Badge tone={runStatusTone(run.status)}>
                            {runStatusLabel(run.status)}
                          </Badge>
                        )}
                      </button>
                      {deletable ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Delete run"
                          onClick={async () => {
                            if (!window.confirm("Delete this run permanently?")) return;
                            try {
                              await api.delete(`/api/content-agent/runs/${run.id}`);
                              setRuns((prev) => prev?.filter((r) => r.id !== run.id) ?? prev);
                              toast.success("Run deleted.");
                            } catch (err) {
                              toast.error(errorMessage(err));
                            }
                          }}
                        >
                          ✕
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {nextCursor ? (
              <div className="mt-3">
                <Button variant="secondary" onClick={() => void loadRuns(nextCursor)}>
                  Load more
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      </PageBody>
    </>
  );
}
