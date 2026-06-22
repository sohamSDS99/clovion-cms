"use client";

import { useCallback, useEffect, useState } from "react";
import { Drawer } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Loading, EmptyState, InlineError } from "@/components/ui/Feedback";
import { api, errorMessage } from "@/lib/ui/client";
import type { LeadForm, LeadSubmission } from "./types";

/** Drawer listing a form's submissions: email, answers, content, date. */
export function SubmissionsViewer({
  form,
  onClose,
}: {
  form: LeadForm | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<LeadSubmission[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (formId: string, cursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<{
          submissions: LeadSubmission[];
          nextCursor: string | null;
        }>(
          `/api/leadforms/${formId}/submissions`,
          cursor ? { cursor } : undefined,
        );
        setRows((prev) =>
          cursor ? [...prev, ...res.submissions] : res.submissions,
        );
        setNextCursor(res.nextCursor);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (form) {
      setRows([]);
      setNextCursor(null);
      void load(form.id);
    }
  }, [form, load]);

  return (
    <Drawer
      open={Boolean(form)}
      onClose={onClose}
      width="max-w-2xl"
      title={form ? `Submissions — ${form.name}` : "Submissions"}
    >
      {error ? <InlineError message={error} /> : null}

      {loading && rows.length === 0 ? (
        <Loading label="Loading submissions…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No submissions yet"
          description="Leads who unlock a gated resource using this form will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-mute">
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Answers</th>
                <th className="py-2 pr-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-line align-top">
                  <td className="py-2.5 pr-3 font-medium text-ink">
                    {s.email}
                  </td>
                  <td className="py-2.5 pr-3 text-ink-soft">
                    <AnswerList data={s.data} />
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-ink-mute">
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {nextCursor ? (
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                loading={loading}
                onClick={() => form && load(form.id, nextCursor)}
              >
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}

/** Compact key/value rendering of a submission's captured answers. */
function AnswerList({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) return <span className="text-ink-faint">—</span>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs text-ink-mute">{k}</dt>
          <dd className="text-xs text-ink">{formatValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v == null) return "—";
  return String(v);
}
