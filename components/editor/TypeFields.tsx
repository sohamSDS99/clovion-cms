"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { isoToLocalInput, localInputToIso } from "@/lib/ui/format";
import type { ContentType } from "@/lib/ui/types";

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
  // Only WEBINAR and NEWS carry extra structured fields. BLOG, RESEARCH, FAQ
  // and RESOURCE are article-shaped and share the same editor (RESOURCE's
  // downloadable file is handled separately in the Details tab).
  if (type !== "WEBINAR" && type !== "NEWS") return null;

  return (
    <Card>
      <CardHeader title={`${labelFor(type)} details`} />
      <div className="space-y-4 p-5">
        {type === "WEBINAR" ? (
          <WebinarFields typeData={typeData} onChange={onChange} fieldErrors={fieldErrors} />
        ) : (
          <NewsFields typeData={typeData} onChange={onChange} />
        )}
      </div>
    </Card>
  );
}

function labelFor(type: ContentType): string {
  return { WEBINAR: "Webinar", RESOURCE: "Resource", FAQ: "FAQ", NEWS: "News", BLOG: "Blog", RESEARCH: "Research" }[type];
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
