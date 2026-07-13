"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { MediaPicker } from "@/components/media/MediaPicker";
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
  // Only WEBINAR, NEWS and COURSE carry extra structured fields. BLOG,
  // RESEARCH, FAQ and RESOURCE are article-shaped and share the same editor
  // (RESOURCE's downloadable file is handled separately in the Details tab).
  if (type !== "WEBINAR" && type !== "NEWS" && type !== "COURSE") return null;

  return (
    <Card>
      <CardHeader title={`${labelFor(type)} details`} />
      <div className="space-y-4 p-5">
        {type === "WEBINAR" ? (
          <WebinarFields typeData={typeData} onChange={onChange} fieldErrors={fieldErrors} />
        ) : type === "COURSE" ? (
          <CourseFields typeData={typeData} onChange={onChange} fieldErrors={fieldErrors} />
        ) : (
          <NewsFields typeData={typeData} onChange={onChange} />
        )}
      </div>
    </Card>
  );
}

function labelFor(type: ContentType): string {
  return { WEBINAR: "Webinar", RESOURCE: "Resource", FAQ: "FAQ", NEWS: "News", BLOG: "Blog", RESEARCH: "Research", COURSE: "Course lesson" }[type];
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

/* ── COURSE ──────────────────────────────────────────────────────────────── */
interface CourseDownload {
  mediaAssetId: string;
  label: string;
}

const MAX_KEY_LEARNINGS = 8;
const MAX_DOWNLOADS = 6;

/**
 * COURSE lesson fields — course grouping (slug/title/lesson number, all
 * required by the publish gate), an optional key-learnings bullet list and
 * optional downloads picked from the media library (stored as
 * {mediaAssetId, label}; the public API resolves them to URLs).
 */
export function CourseFields({
  typeData,
  onChange,
  fieldErrors,
}: {
  typeData: TypeData;
  onChange: (patch: TypeData) => void;
  fieldErrors?: Record<string, string>;
}) {
  const keyLearnings = Array.isArray(typeData.keyLearnings)
    ? (typeData.keyLearnings as string[])
    : [];
  const downloads = Array.isArray(typeData.downloads)
    ? (typeData.downloads as CourseDownload[])
    : [];
  // Which download row the media picker targets; "new" appends a row.
  const [picking, setPicking] = useState<number | "new" | null>(null);

  const lessonNumber =
    typeof typeData.lessonNumber === "number" && Number.isFinite(typeData.lessonNumber)
      ? String(typeData.lessonNumber)
      : "";

  const setLearnings = (next: string[]) =>
    onChange({ keyLearnings: next.length ? next : undefined });
  const setDownloads = (next: CourseDownload[]) =>
    onChange({ downloads: next.length ? next : undefined });

  return (
    <>
      <Input
        label="Course slug"
        hint="kebab-case; every lesson of one course shares it"
        placeholder="e.g. chemical-safety-101"
        value={str(typeData.courseSlug)}
        onChange={(e) => onChange({ courseSlug: e.target.value || undefined })}
        error={fieldErrors?.["typeData.courseSlug"]}
      />
      <Input
        label="Course title"
        placeholder="e.g. Chemical Safety 101"
        value={str(typeData.courseTitle)}
        onChange={(e) => onChange({ courseTitle: e.target.value || undefined })}
        error={fieldErrors?.["typeData.courseTitle"]}
      />
      <Input
        type="number"
        label="Lesson number"
        hint="1–50; orders this lesson within its course"
        min={1}
        max={50}
        value={lessonNumber}
        onChange={(e) =>
          onChange({
            lessonNumber: e.target.value === "" ? undefined : Number(e.target.value),
          })
        }
        error={fieldErrors?.["typeData.lessonNumber"]}
      />

      {/* Key learnings — short takeaway bullets rendered at the lesson top. */}
      <div>
        <Label>Key learnings</Label>
        <div className="space-y-2">
          {keyLearnings.map((text, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  value={text}
                  placeholder={`Learning ${i + 1}`}
                  aria-label={`Key learning ${i + 1}`}
                  onChange={(e) =>
                    setLearnings(keyLearnings.map((t, j) => (j === i ? e.target.value : t)))
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLearnings(keyLearnings.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={keyLearnings.length >= MAX_KEY_LEARNINGS}
            onClick={() => setLearnings([...keyLearnings, ""])}
          >
            Add learning
          </Button>
        </div>
      </div>

      {/* Downloads — lesson materials from the media library. */}
      <div>
        <Label>Downloads</Label>
        <div className="space-y-2">
          {downloads.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  value={d.label}
                  placeholder="Label shown on the lesson page"
                  aria-label={`Download ${i + 1} label`}
                  onChange={(e) =>
                    setDownloads(
                      downloads.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <Button variant="secondary" size="sm" onClick={() => setPicking(i)}>
                Replace file
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDownloads(downloads.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={downloads.length >= MAX_DOWNLOADS}
            onClick={() => setPicking("new")}
          >
            Add download
          </Button>
        </div>
      </div>

      <MediaPicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        kind="ALL"
        title="Choose download file"
        onPick={(a) => {
          if (picking === "new") {
            setDownloads([...downloads, { mediaAssetId: a.id, label: a.filename || "Download" }]);
          } else if (typeof picking === "number") {
            setDownloads(
              downloads.map((x, j) => (j === picking ? { ...x, mediaAssetId: a.id } : x)),
            );
          }
          setPicking(null);
        }}
      />
    </>
  );
}
