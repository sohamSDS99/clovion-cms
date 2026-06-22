"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Loading, EmptyState, InlineError } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage, ApiError } from "@/lib/ui/client";
import { LeadFormEditor } from "./LeadFormEditor";
import { SubmissionsViewer } from "./SubmissionsViewer";
import type { LeadForm } from "./types";

/**
 * Lead Forms admin surface (FR §6.2 RESOURCE delta, NG3, PRD Q4): list forms,
 * create/edit via the builder, view per-form submissions, and delete (with the
 * server's in-use 409 guard surfaced to the user).
 */
export function LeadFormManager() {
  const toast = useToast();
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<LeadForm | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<LeadForm | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LeadForm | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ forms: LeadForm[] }>("/api/leadforms");
      setForms(res.forms);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/api/leadforms/${confirmDelete.id}`);
      toast.success("Lead form deleted.");
      setConfirmDelete(null);
      void load();
    } catch (err) {
      // The service returns 409 when a published gated resource still uses it.
      if (err instanceof ApiError && err.status === 409) {
        toast.error(err.message);
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Lead Forms
          </h1>
          <p className="mt-1 text-sm text-ink-mute">
            Forms that gate downloadable resources. A visitor unlocks the PDF only
            after submitting one of these.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          New form
        </Button>
      </div>

      {error ? <InlineError message={error} /> : null}

      {loading ? (
        <Loading label="Loading lead forms…" />
      ) : forms.length === 0 ? (
        <EmptyState
          title="No lead forms yet"
          description="Create a lead form, then attach it to a gated resource to capture leads."
          action={
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              New form
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {forms.map((form) => (
            <Card key={form.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {form.name}
                    {form.isActive ? (
                      <Badge tone="published">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )}
                  </span>
                }
                subtitle={
                  <span>
                    {form.fields.length} field
                    {form.fields.length === 1 ? "" : "s"}
                    {" · "}
                    {form._count?.submissions ?? 0} submission
                    {(form._count?.submissions ?? 0) === 1 ? "" : "s"}
                    {form.description ? ` · ${form.description}` : ""}
                  </span>
                }
                action={
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setViewing(form)}
                    >
                      Submissions
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditing(form)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setConfirmDelete(form)}
                    >
                      Delete
                    </Button>
                  </div>
                }
              />
            </Card>
          ))}
        </div>
      )}

      {/* Create */}
      <LeadFormEditor
        open={creating}
        form={null}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          toast.success("Lead form created.");
          void load();
        }}
      />

      {/* Edit */}
      <LeadFormEditor
        open={Boolean(editing)}
        form={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          toast.success("Lead form updated.");
          void load();
        }}
      />

      {/* Submissions */}
      <SubmissionsViewer form={viewing} onClose={() => setViewing(null)} />

      {/* Delete confirmation */}
      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        size="sm"
        title="Delete lead form?"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={doDelete} loading={deleting}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Delete <strong className="text-ink">{confirmDelete?.name}</strong> and
          all of its captured submissions? This cannot be undone. Forms still used
          by a published gated resource cannot be deleted.
        </p>
      </Modal>
    </div>
  );
}
