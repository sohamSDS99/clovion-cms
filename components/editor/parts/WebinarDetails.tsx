"use client";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Field";
import { isoToLocalInput, localInputToIso } from "@/lib/ui/format";
import type { Draft } from "../layouts/types";

type TypeData = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * The event hero for the webinar editor: scheduling, registration CTA,
 * speakers, and the live-vs-recorded state with the recording URL revealed
 * once the session has a recording. This is the *primary* content of a
 * webinar (an event landing page), so it carries the visual weight — not the
 * description body below it.
 *
 * Reads/writes the same `typeData` keys as the shared WebinarFields
 * (startAt, endAt, timezone, registrationUrl, speakerNames[], recordingUrl)
 * plus an `isRecorded` flag (allowed by the passthrough schema) that toggles
 * the post-event recording surface. Patches go through `update(...)`.
 */
export function WebinarDetails({
  draft,
  update,
  gateErrors,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  gateErrors: Record<string, string>;
}) {
  const td = draft.typeData as TypeData;
  const patch = (p: TypeData) => update({ typeData: { ...draft.typeData, ...p } });

  const speakers = Array.isArray(td.speakerNames)
    ? (td.speakerNames as string[]).join(", ")
    : "";
  // `isRecorded` is an explicit toggle; treat a stored recordingUrl as implying it.
  const isRecorded = Boolean(td.isRecorded) || Boolean(str(td.recordingUrl));
  const registrationUrl = str(td.registrationUrl);

  return (
    <Card className="overflow-hidden">
      {/* Hero header: clearly the most important surface in the editor. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper-sunken px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-sm bg-accent-soft text-accent-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Event details</h2>
            <p className="text-xs text-ink-mute">The headline information for this webinar landing page.</p>
          </div>
        </div>
        <Badge tone={isRecorded ? "accent" : "scheduled"}>
          <span className={isRecorded ? "" : "relative flex h-1.5 w-1.5"}>
            {!isRecorded ? (
              <>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2563a8] opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#2563a8]" />
              </>
            ) : null}
          </span>
          {isRecorded ? "Recorded" : "Live event"}
        </Badge>
      </div>

      <div className="space-y-6 p-5">
        {/* When & where */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
            Date &amp; time
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              type="datetime-local"
              label="Starts"
              value={isoToLocalInput(str(td.startAt))}
              onChange={(e) => patch({ startAt: localInputToIso(e.target.value) ?? undefined })}
              error={gateErrors["typeData.startAt"]}
            />
            <Input
              type="datetime-local"
              label="Ends"
              value={isoToLocalInput(str(td.endAt))}
              onChange={(e) => patch({ endAt: localInputToIso(e.target.value) ?? undefined })}
              error={gateErrors["typeData.endAt"]}
            />
          </div>
          <Input
            label="Timezone"
            hint="IANA name"
            placeholder="e.g. America/New_York"
            value={str(td.timezone)}
            onChange={(e) => patch({ timezone: e.target.value || undefined })}
          />
        </section>

        {/* Registration call-to-action */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
            Registration
          </h3>
          <div className="rounded-sm border border-accent/25 bg-accent-soft p-4">
            <Input
              label="Registration URL"
              hint="primary call-to-action"
              type="url"
              placeholder="https://…"
              value={registrationUrl}
              onChange={(e) => patch({ registrationUrl: e.target.value || undefined })}
              error={gateErrors["typeData.registrationUrl"]}
            />
            <div className="mt-3 flex items-center gap-2 text-[13px]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent-ink" aria-hidden="true">
                <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />
              </svg>
              {registrationUrl ? (
                <span className="truncate text-accent-ink">
                  Attendees will register at{" "}
                  <a
                    href={registrationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-2"
                  >
                    {registrationUrl}
                  </a>
                </span>
              ) : (
                <span className="text-ink-mute">
                  Add a registration link — it powers the &ldquo;Register&rdquo; button on the live page.
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Speakers */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
            Speakers
          </h3>
          <Input
            label="Featured speakers"
            hint="comma-separated"
            placeholder="Ada Lovelace, Alan Turing"
            value={speakers}
            onChange={(e) =>
              patch({
                speakerNames: e.target.value
                  ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  : undefined,
              })
            }
          />
          {speakers ? (
            <div className="flex flex-wrap gap-1.5">
              {speakers
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((name, i) => (
                  <Badge key={`${name}-${i}`} tone="neutral">
                    {name}
                  </Badge>
                ))}
            </div>
          ) : null}
        </section>

        {/* Live vs recorded state */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
            Format
          </h3>
          <div className="flex flex-col gap-1.5 rounded-sm border border-line bg-paper p-3">
            <span className="text-[13px] font-medium text-ink-soft">Session status</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Session status">
              <StateToggle
                active={!isRecorded}
                label="Live"
                hint="Upcoming or in-progress"
                onClick={() => patch({ isRecorded: false })}
              />
              <StateToggle
                active={isRecorded}
                label="Recorded"
                hint="Available on demand"
                onClick={() => patch({ isRecorded: true })}
              />
            </div>
          </div>

          {isRecorded ? (
            <Input
              label="Recording URL"
              hint="shown after the event"
              type="url"
              placeholder="https://… (link to the on-demand recording)"
              value={str(td.recordingUrl)}
              onChange={(e) => patch({ recordingUrl: e.target.value || undefined })}
            />
          ) : null}
        </section>
      </div>
    </Card>
  );
}

function StateToggle({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={
        "flex flex-1 flex-col gap-0.5 rounded-sm border px-3 py-2 text-left transition-colors " +
        (active
          ? "border-accent bg-accent-soft text-accent-ink"
          : "border-line-strong bg-paper-raised text-ink-soft hover:bg-paper-sunken")
      }
    >
      <span className="text-sm font-medium">{label}</span>
      <span className={active ? "text-xs text-accent-ink/80" : "text-xs text-ink-mute"}>{hint}</span>
    </button>
  );
}
