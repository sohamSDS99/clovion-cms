"use client";

import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Field";
import { EmptyState, InlineError, Loading } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/ui/client";
import { CONTENT_TYPES, contentTypeLabel } from "@/lib/ui/format";
import { cn } from "@/lib/ui/cn";
import type { ContentType, WritingSop } from "@/lib/ui/types";

/**
 * Writing SOP management (FR-SETTINGS-01): list with active state, create/edit
 * (name, body, appliesTo), and activate (server enforces one-active-per-type).
 */
export function SopManager() {
  const toast = useToast();
  const [sops, setSops] = useState<WritingSop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WritingSop | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    setSops(null);
    setError(null);
    api
      .get<{ sops: WritingSop[] }>("/api/sop")
      .then((r) => setSops(r.sops))
      .catch((e) => setError(errorMessage(e)));
  }

  useEffect(load, []);

  async function activate(id: string) {
    setBusy(id);
    try {
      await api.post(`/api/sop/${id}/activate`);
      toast.success("SOP activated.");
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this SOP?")) return;
    setBusy(id);
    try {
      await api.delete(`/api/sop/${id}`);
      toast.success("SOP deleted.");
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Writing SOPs"
        description="Editorial guidelines that steer AI drafting per content type."
        actions={<Button variant="primary" onClick={() => setEditing("new")}>New SOP</Button>}
      />
      <PageBody className="space-y-4">
        {error ? <InlineError message={error} /> : null}
        {sops === null && !error ? (
          <Loading />
        ) : sops && sops.length === 0 ? (
          <EmptyState
            title="No SOPs yet"
            description="Create your first writing SOP to guide AI output."
            action={<Button variant="primary" onClick={() => setEditing("new")}>New SOP</Button>}
          />
        ) : (
          <div className="space-y-2">
            {sops?.map((sop) => (
              <Card key={sop.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink">{sop.name}</span>
                    {sop.isActive ? <Badge tone="published">Active</Badge> : null}
                    <span className="text-xs text-ink-faint">v{sop.version}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {sop.appliesTo.map((t) => (
                      <Badge key={t} tone="neutral">{contentTypeLabel(t)}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {!sop.isActive ? (
                    <Button variant="secondary" size="sm" loading={busy === sop.id} onClick={() => activate(sop.id)}>
                      Activate
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(sop)}>Edit</Button>
                  <Button variant="ghost" size="sm" disabled={sop.isActive} onClick={() => remove(sop.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      {editing ? (
        <SopEditor
          sop={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </>
  );
}

function SopEditor({
  sop,
  onClose,
  onSaved,
}: {
  sop: WritingSop | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(sop?.name ?? "");
  const [body, setBody] = useState(sop?.body ?? "");
  const [appliesTo, setAppliesTo] = useState<ContentType[]>(sop?.appliesTo ?? []);
  const [saving, setSaving] = useState(false);

  function toggle(t: ContentType) {
    setAppliesTo((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  async function save() {
    if (!name.trim() || !body.trim() || appliesTo.length === 0) {
      toast.error("Name, body, and at least one content type are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), body, appliesTo };
      if (sop) await api.patch(`/api/sop/${sop.id}`, payload);
      else await api.post("/api/sop", payload);
      toast.success(sop ? "SOP updated." : "SOP created.");
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={sop ? "Edit SOP" : "New SOP"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-soft">Applies to</span>
          <div className="flex flex-wrap gap-1.5">
            {CONTENT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => toggle(t)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  appliesTo.includes(t)
                    ? "border-accent bg-accent-soft text-accent-ink"
                    : "border-line-strong text-ink-soft hover:bg-paper-sunken"
                )}
              >
                {contentTypeLabel(t)}
              </button>
            ))}
          </div>
        </div>
        <Textarea
          label="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          placeholder="Tone, structure, do's and don'ts…"
        />
      </div>
    </Modal>
  );
}
