"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { MediaPicker } from "@/components/media/MediaPicker";
import { api } from "@/lib/ui/client";
import { formatBytes } from "@/lib/ui/format";
import { cn } from "@/lib/ui/cn";
import type { MediaAsset } from "@/lib/ui/types";

type TypeData = Record<string, unknown>;

interface LeadForm {
  id: string;
  name: string;
  _count?: { submissions: number };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

const KINDS = [
  { value: "EBOOK", label: "Ebook" },
  { value: "WHITEPAPER", label: "Whitepaper" },
  { value: "TEMPLATE", label: "Template" },
  { value: "CHECKLIST", label: "Checklist" },
  { value: "OTHER", label: "Other" },
] as const;

/**
 * The hero of the resource editor: the downloadable file itself plus how it is
 * delivered (kind + gating). The PDF is required to publish, so its absence is
 * surfaced loudly. Writes into `typeData` via `onChange`.
 */
export function ResourceFile({
  typeData,
  onChange,
  fieldErrors,
}: {
  typeData: TypeData;
  onChange: (patch: TypeData) => void;
  fieldErrors?: Record<string, string>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pdf, setPdf] = useState<MediaAsset | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const pdfId = str(typeData.pdfAssetId);
  const gated = Boolean(typeData.gated);
  const pdfError = fieldErrors?.["typeData.pdfAssetId"];

  // Resolve the attached asset to show its real filename / size.
  useEffect(() => {
    if (!pdfId) {
      setPdf(null);
      return;
    }
    let active = true;
    setPdfLoading(true);
    api
      .get<MediaAsset>(`/api/media/${pdfId}`)
      .then((a) => active && setPdf(a))
      .catch(() => active && setPdf(null))
      .finally(() => active && setPdfLoading(false));
    return () => {
      active = false;
    };
  }, [pdfId]);

  return (
    <Card>
      <CardHeader
        title="Resource file"
        subtitle="The deliverable people download. A PDF is required to publish."
        action={
          pdfId ? (
            <Badge tone="published">Attached</Badge>
          ) : (
            <Badge tone="draft">No file yet</Badge>
          )
        }
      />

      <div className="space-y-5 p-5">
        {/* ── The file drop / preview — the centerpiece ────────────────── */}
        {pdfId ? (
          <div
            className={cn(
              "flex items-center gap-4 rounded border bg-paper p-4",
              pdfError ? "border-danger" : "border-line"
            )}
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-sm bg-paper-sunken text-[11px] font-semibold uppercase tracking-wide text-ink-mute">
              PDF
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {pdfLoading ? "Loading…" : pdf?.filename ?? "Attached file"}
              </p>
              <p className="text-xs text-ink-mute">
                {pdf ? formatBytes(pdf.sizeBytes) : "PDF document"}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
                Replace
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange({ pdfAssetId: undefined })}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded border border-dashed bg-paper px-6 py-10 text-center transition-colors",
              "hover:border-accent hover:bg-accent-soft/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25",
              pdfError ? "border-danger" : "border-line-strong"
            )}
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-paper-sunken text-lg text-ink-mute">
              ↑
            </span>
            <span className="font-display text-base font-semibold text-ink">
              Attach the resource PDF
            </span>
            <span className="text-xs text-ink-mute">
              Upload a new file or choose one from the media library
            </span>
          </button>
        )}

        {pdfError ? (
          <p className="-mt-2 text-xs text-danger" role="alert">
            {pdfError}
          </p>
        ) : null}

        {/* ── Kind ──────────────────────────────────────────────────────── */}
        <Select
          label="Resource kind"
          hint="how it appears in listings"
          value={str(typeData.resourceKind)}
          onChange={(e) => onChange({ resourceKind: e.target.value || undefined })}
        >
          <option value="">Select…</option>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>

        {/* ── Gating ────────────────────────────────────────────────────── */}
        <GatingControls typeData={typeData} onChange={onChange} gated={gated} />
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        kind="PDF"
        title="Attach resource PDF"
        onPick={(a) => onChange({ pdfAssetId: a.id })}
      />
    </Card>
  );
}

/* ── Gated toggle + lead-form reference ──────────────────────────────────── */
function GatingControls({
  typeData,
  onChange,
  gated,
}: {
  typeData: TypeData;
  onChange: (patch: TypeData) => void;
  gated: boolean;
}) {
  const [forms, setForms] = useState<LeadForm[] | null>(null);
  const leadFormId = str(typeData.leadFormId);

  // Lazily load lead forms the first time gating is turned on.
  useEffect(() => {
    if (!gated || forms !== null) return;
    let active = true;
    api
      .get<{ forms: LeadForm[] }>("/api/leadforms")
      .then((r) => active && setForms(r.forms))
      .catch(() => active && setForms([]));
    return () => {
      active = false;
    };
  }, [gated, forms]);

  return (
    <div className="space-y-3 rounded border border-line bg-paper-sunken/50 p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={gated}
          onChange={(e) =>
            onChange({
              gated: e.target.checked,
              // Drop the form ref when un-gating to avoid orphan references.
              leadFormId: e.target.checked ? typeData.leadFormId : undefined,
            })
          }
          className="mt-0.5 h-4 w-4 rounded border-line-strong text-accent focus:ring-accent/25"
        />
        <span>
          <span className="block text-sm font-medium text-ink">
            Gated download
          </span>
          <span className="block text-xs text-ink-mute">
            Require a lead form before the PDF is released.
          </span>
        </span>
      </label>

      {gated ? (
        <div className="pl-7">
          <Select
            label="Lead form"
            value={leadFormId}
            onChange={(e) => onChange({ leadFormId: e.target.value || undefined })}
          >
            <option value="">
              {forms === null ? "Loading…" : "Select a lead form…"}
            </option>
            {(forms ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f._count ? ` (${f._count.submissions} leads)` : ""}
              </option>
            ))}
          </Select>
          {forms !== null && forms.length === 0 ? (
            <p className="mt-1.5 text-xs text-ink-mute">
              No lead forms yet — create one in the Lead Forms area first.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
