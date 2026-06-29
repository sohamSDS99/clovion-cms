"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { isoToLocalInput, localInputToIso } from "@/lib/ui/format";
import type { ContentType, FaqItem } from "@/lib/ui/types";

type TypeData = Record<string, unknown>;

/**
 * Type-specific field panels (FR-EDITOR per type), driven by `type`, reading and
 * writing into `typeData`. Field names match lib/content/schemas typeData
 * schemas and the publish gate (lib/workflow/validation).
 */
export function TypeFields({
  type,
  typeData,
  onChange,
  fieldErrors,
}: {
  type: ContentType;
  typeData: TypeData;
  onChange: (patch: TypeData) => void;
  fieldErrors?: Record<string, string>;
}) {
  if (type === "BLOG") return null;

  return (
    <Card>
      <CardHeader title={`${labelFor(type)} details`} />
      <div className="space-y-4 p-5">
        {type === "WEBINAR" ? (
          <WebinarFields typeData={typeData} onChange={onChange} fieldErrors={fieldErrors} />
        ) : null}
        {type === "FAQ" ? (
          <FaqFields typeData={typeData} onChange={onChange} fieldErrors={fieldErrors} />
        ) : null}
        {type === "NEWS" ? (
          <NewsFields typeData={typeData} onChange={onChange} />
        ) : null}
      </div>
    </Card>
  );
}

function labelFor(type: ContentType): string {
  return { WEBINAR: "Webinar", RESOURCE: "Resource", FAQ: "FAQ", NEWS: "News", BLOG: "Blog" }[type];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/* ── WEBINAR ─────────────────────────────────────────────────────────────── */
export function WebinarFields({
  typeData,
  onChange,
  fieldErrors,
}: {
  typeData: TypeData;
  onChange: (patch: TypeData) => void;
  fieldErrors?: Record<string, string>;
}) {
  const speakers = Array.isArray(typeData.speakerNames)
    ? (typeData.speakerNames as string[]).join(", ")
    : "";
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          type="datetime-local"
          label="Start"
          value={isoToLocalInput(str(typeData.startAt))}
          onChange={(e) => onChange({ startAt: localInputToIso(e.target.value) ?? undefined })}
          error={fieldErrors?.["typeData.startAt"]}
        />
        <Input
          type="datetime-local"
          label="End"
          value={isoToLocalInput(str(typeData.endAt))}
          onChange={(e) => onChange({ endAt: localInputToIso(e.target.value) ?? undefined })}
        />
      </div>
      <Input
        label="Timezone"
        placeholder="e.g. America/New_York"
        value={str(typeData.timezone)}
        onChange={(e) => onChange({ timezone: e.target.value || undefined })}
      />
      <Input
        label="Registration URL"
        placeholder="https://…"
        value={str(typeData.registrationUrl)}
        onChange={(e) => onChange({ registrationUrl: e.target.value || undefined })}
        error={fieldErrors?.["typeData.registrationUrl"]}
      />
      <Input
        label="Speakers"
        hint="comma-separated"
        placeholder="Ada Lovelace, Alan Turing"
        value={speakers}
        onChange={(e) =>
          onChange({
            speakerNames: e.target.value
              ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
              : undefined,
          })
        }
      />
      <Input
        label="Recording URL"
        placeholder="https://… (after the live event)"
        value={str(typeData.recordingUrl)}
        onChange={(e) => onChange({ recordingUrl: e.target.value || undefined })}
      />
    </>
  );
}

/* ── FAQ ─────────────────────────────────────────────────────────────────── */
export function FaqFields({
  typeData,
  onChange,
  fieldErrors,
}: {
  typeData: TypeData;
  onChange: (patch: TypeData) => void;
  fieldErrors?: Record<string, string>;
}) {
  const items: FaqItem[] = Array.isArray(typeData.faqItems)
    ? (typeData.faqItems as FaqItem[])
    : [];

  const update = (next: FaqItem[]) => onChange({ faqItems: next });

  return (
    <div className="space-y-3">
      {fieldErrors?.["typeData.faqItems"] ? (
        <p className="text-xs text-danger" role="alert">{fieldErrors["typeData.faqItems"]}</p>
      ) : null}
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded-sm border border-line bg-paper p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-mute">Question {i + 1}</span>
            <button
              onClick={() => update(items.filter((_, j) => j !== i))}
              className="text-xs text-danger hover:underline"
            >
              Remove
            </button>
          </div>
          <Input
            value={item.question}
            placeholder="Question"
            onChange={(e) =>
              update(items.map((it, j) => (j === i ? { ...it, question: e.target.value } : it)))
            }
          />
          <textarea
            value={item.answer}
            placeholder="Answer"
            rows={2}
            onChange={(e) =>
              update(items.map((it, j) => (j === i ? { ...it, answer: e.target.value } : it)))
            }
            className="w-full resize-y rounded-sm border border-line-strong bg-paper-raised px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => update([...items, { question: "", answer: "" }])}
      >
        Add question
      </Button>
    </div>
  );
}

/* ── NEWS ────────────────────────────────────────────────────────────────── */
export function NewsFields({
  typeData,
  onChange,
}: {
  typeData: TypeData;
  onChange: (patch: TypeData) => void;
}) {
  return (
    <>
      <Input
        label="Source URL"
        placeholder="https://…"
        value={str(typeData.sourceUrl)}
        onChange={(e) => onChange({ sourceUrl: e.target.value || undefined })}
      />
      <Input
        label="Source name"
        placeholder="e.g. TechCrunch"
        value={str(typeData.sourceName)}
        onChange={(e) => onChange({ sourceName: e.target.value || undefined })}
      />
      <Input
        label="Dateline"
        placeholder="e.g. San Francisco, June 22"
        value={str(typeData.dateline)}
        onChange={(e) => onChange({ dateline: e.target.value || undefined })}
      />
    </>
  );
}
