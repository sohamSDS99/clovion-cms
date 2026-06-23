"use client";

import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Field";
import { EmptyState, InlineError, Loading } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/ui/client";
import { relativeTime } from "@/lib/ui/format";

/**
 * Knowledge Base management (FR-SETTINGS-02). Add sources (pasted text / URL),
 * which are chunked + embedded for the AI Write engine to ground drafts in.
 * Lists items with ingestion status; supports reindex + delete.
 */

type KbStatus = "PROCESSING" | "READY" | "FAILED";
type KbSourceType = "DOC" | "URL" | "PASTED_TEXT" | "PDF";

interface KbItem {
  id: string;
  title: string;
  sourceType: KbSourceType;
  status: KbStatus;
  tags: string[];
  createdAt: string;
}

const STATUS_TONE: Record<KbStatus, "review" | "published" | "unpublished"> = {
  PROCESSING: "review",
  READY: "published",
  FAILED: "unpublished",
};

const SOURCE_LABEL: Record<KbSourceType, string> = {
  PASTED_TEXT: "Pasted text",
  URL: "URL",
  DOC: "Document",
  PDF: "PDF",
};

export function KbManager() {
  const toast = useToast();
  const [items, setItems] = useState<KbItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    setItems(null);
    setError(null);
    api
      .get<{ items: KbItem[] }>("/api/kb")
      .then((r) => setItems(r.items))
      .catch((e) => setError(errorMessage(e)));
  }

  useEffect(load, []);

  async function reindex(id: string) {
    setBusy(id);
    try {
      const r = await api.post<{ ingestError?: string }>(`/api/kb/${id}/reindex`);
      if (r.ingestError) toast.error(`Reindexed, but embedding failed: ${r.ingestError}`);
      else toast.success("Reindexed.");
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Delete "${title}" from the knowledge base?`)) return;
    setBusy(id);
    try {
      await api.delete(`/api/kb/${id}`);
      toast.success("Deleted.");
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
        title="Knowledge Base"
        description="Sources the AI Write engine grounds drafts in (chunked + embedded). Add pasted text or a URL."
        actions={
          <Button onClick={() => setAdding(true)} disabled={items === null}>
            Add knowledge
          </Button>
        }
      />
      <PageBody>
        {error ? (
          <div className="flex flex-col items-start gap-3">
            <InlineError message={error} />
            <Button variant="secondary" onClick={load}>
              Retry
            </Button>
          </div>
        ) : items === null ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            title="No knowledge yet"
            description="Add reference material so AI drafts can cite your own facts instead of guessing."
            action={<Button onClick={() => setAdding(true)}>Add knowledge</Button>}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((it) => (
              <Card key={it.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink">{it.title}</span>
                    <Badge tone={STATUS_TONE[it.status]}>{it.status.toLowerCase()}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-mute">
                    <span>{SOURCE_LABEL[it.sourceType]}</span>
                    <span aria-hidden>·</span>
                    <span>added {relativeTime(it.createdAt)}</span>
                    {it.tags.length > 0 ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{it.tags.join(", ")}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => reindex(it.id)}
                    disabled={busy === it.id}
                  >
                    Reindex
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => remove(it.id, it.title)}
                    disabled={busy === it.id}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      {adding ? (
        <AddKnowledgeModal
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      ) : null}
    </>
  );
}

function AddKnowledgeModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<"PASTED_TEXT" | "URL">("PASTED_TEXT");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave =
    title.trim().length > 0 &&
    (sourceType === "URL" ? url.trim().length > 0 : text.trim().length > 0);

  async function save() {
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        sourceType,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        ...(sourceType === "URL" ? { url: url.trim() } : { rawContent: text }),
      };
      const r = await api.post<{ ingestError?: string }>("/api/kb", body);
      if (r.ingestError) {
        toast.error(
          `Saved, but embedding failed: ${r.ingestError}. Connect an embeddings provider to enable grounding.`,
        );
      } else {
        toast.success("Knowledge added and indexed.");
      }
      onAdded();
    } catch (e) {
      toast.error(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Modal open title="Add knowledge" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Clovion AI product overview"
        />
        <Select
          label="Source"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as "PASTED_TEXT" | "URL")}
        >
          <option value="PASTED_TEXT">Paste text</option>
          <option value="URL">From URL</option>
        </Select>
        {sourceType === "URL" ? (
          <Input
            label="URL"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        ) : (
          <Textarea
            label="Content"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Paste the reference material the AI should ground drafts in…"
          />
        )}
        <Input
          label="Tags (optional, comma-separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="product, pricing"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!canSave || saving}>
            {saving ? "Indexing…" : "Add & index"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
