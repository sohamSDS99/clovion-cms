"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, FieldShell } from "@/components/ui/Field";
import { InlineError } from "@/components/ui/Feedback";
import { api, errorMessage } from "@/lib/ui/client";
import { FieldBuilder } from "./FieldBuilder";
import type { LeadForm, LeadField } from "./types";

interface Draft {
  name: string;
  description: string;
  isActive: boolean;
  fields: LeadField[];
}

function toDraft(form: LeadForm | null): Draft {
  return {
    name: form?.name ?? "",
    description: form?.description ?? "",
    isActive: form?.isActive ?? true,
    fields: form?.fields ?? [],
  };
}

/**
 * Create / edit dialog for a lead form. On save, POST (create) or PATCH (edit)
 * and call `onSaved`. Surfaces 422 field-validation messages from the API.
 */
export function LeadFormEditor({
  open,
  form,
  onClose,
  onSaved,
}: {
  open: boolean;
  form: LeadForm | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(form));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the draft whenever the dialog opens for a different form.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const key = form?.id ?? "new";
  if (open && seededFor !== key) {
    setDraft(toDraft(form));
    setError(null);
    setSeededFor(key);
  }
  if (!open && seededFor !== null) setSeededFor(null);

  async function save() {
    setSaving(true);
    setError(null);
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      isActive: draft.isActive,
      fields: draft.fields,
    };
    try {
      if (form) {
        await api.patch(`/api/leadforms/${form.id}`, payload);
      } else {
        await api.post("/api/leadforms", payload);
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={form ? "Edit lead form" : "New lead form"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={save}
            loading={saving}
            disabled={!draft.name.trim()}
          >
            {form ? "Save changes" : "Create form"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <InlineError message={error} /> : null}

        <Input
          label="Name"
          placeholder="e.g. Whitepaper download gate"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <Textarea
          label="Description"
          hint="optional"
          placeholder="Internal note about where this form is used."
          value={draft.description}
          onChange={(e) =>
            setDraft((d) => ({ ...d, description: e.target.value }))
          }
        />

        <FieldShell label="Status">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={draft.isActive}
              onChange={(e) =>
                setDraft((d) => ({ ...d, isActive: e.target.checked }))
              }
            />
            Active (available to gate resources)
          </label>
        </FieldShell>

        <div>
          <h4 className="mb-2 font-display text-sm font-semibold text-ink">
            Fields
          </h4>
          <FieldBuilder
            fields={draft.fields}
            onChange={(fields) => setDraft((d) => ({ ...d, fields }))}
          />
        </div>
      </div>
    </Modal>
  );
}
