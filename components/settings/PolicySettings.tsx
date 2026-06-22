"use client";

import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Loading, InlineError } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/ui/cn";
import { api, errorMessage, ApiError } from "@/lib/ui/client";

/**
 * Org-policy workflow toggles (FR-CONTENT-08, §6.3). Admin-only: the GET/PUT
 * endpoints reject non-admins (403), so we surface a read-only notice and
 * disable the controls. The API remains authoritative — the disabled state is
 * a best-effort UX affordance only.
 */
interface OrgPolicy {
  id: string;
  selfPublish: boolean;
  newsFastPublish: boolean;
  webinarAutoRecorded: boolean;
  updatedAt: string;
  updatedById: string | null;
}

type ToggleKey = "selfPublish" | "newsFastPublish" | "webinarAutoRecorded";

interface ToggleDef {
  key: ToggleKey;
  label: string;
  help: string;
}

const TOGGLES: ToggleDef[] = [
  {
    key: "selfPublish",
    label: "Authors can self-publish",
    help: "When on, Authors may publish or schedule their own content without a separate reviewer approving it.",
  },
  {
    key: "newsFastPublish",
    label: "News fast-publish lane for Authors",
    help: "Lets Authors push NEWS items straight to published, skipping the in-review step for time-sensitive announcements.",
  },
  {
    key: "webinarAutoRecorded",
    label: "Auto-mark webinars as recorded after they end",
    help: "After a webinar's end time passes, automatically flip its state to recorded so the replay surfaces without manual edits.",
  },
];

export function PolicySettings() {
  const toast = useToast();
  const [policy, setPolicy] = useState<OrgPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState<ToggleKey | null>(null);

  useEffect(() => {
    api
      .get<OrgPolicy>("/api/settings/policy")
      .then(setPolicy)
      .catch((e) => {
        // 403 -> the caller is not an Admin; degrade to a read-only notice
        // rather than a hard error screen.
        if (e instanceof ApiError && e.status === 403) {
          setReadOnly(true);
        } else {
          setError(errorMessage(e));
        }
      });
  }, []);

  async function toggle(key: ToggleKey, next: boolean) {
    if (!policy || readOnly) return;
    setSaving(key);
    // Optimistic update — reconcile with the server response on success.
    const previous = policy;
    setPolicy({ ...policy, [key]: next });
    try {
      const updated = await api.put<OrgPolicy>("/api/settings/policy", { [key]: next });
      setPolicy(updated);
      toast.success("Policy saved.");
    } catch (e) {
      setPolicy(previous); // roll back
      if (e instanceof ApiError && e.status === 403) {
        setReadOnly(true);
        toast.error("Admin only.");
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setSaving(null);
    }
  }

  if (error) {
    return (
      <PageBody>
        <InlineError message={error} />
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader
        title="Workflow policy"
        description="Org-wide lifecycle rules for authoring and publishing."
        actions={
          readOnly ? <Badge tone="review">Read only</Badge> : <Badge tone="published">Admin</Badge>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardHeader
              title="Publishing rules"
              subtitle="Applies to every content type unless a type sets its own lane."
            />
            {!policy && !readOnly ? (
              <div className="p-5">
                <Loading />
              </div>
            ) : (
              <div className="divide-y divide-line">
                {readOnly ? (
                  <p className="px-5 py-4 text-sm text-ink-mute">
                    Only an Admin can view or change workflow policy.
                  </p>
                ) : (
                  TOGGLES.map((t) => (
                    <PolicyToggle
                      key={t.key}
                      def={t}
                      checked={policy ? policy[t.key] : false}
                      busy={saving === t.key}
                      disabled={readOnly || saving !== null}
                      onChange={(next) => toggle(t.key, next)}
                    />
                  ))
                )}
              </div>
            )}
          </Card>
          {policy && !readOnly ? (
            <p className="mt-3 text-xs text-ink-mute">
              Changes save immediately and are recorded in the audit log.
            </p>
          ) : null}
        </div>
      </PageBody>
    </>
  );
}

/** A single labelled switch with help text. Accessible (role=switch). */
function PolicyToggle({
  def,
  checked,
  busy,
  disabled,
  onChange,
}: {
  def: ToggleDef;
  checked: boolean;
  busy: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const labelId = `policy-${def.key}-label`;
  const helpId = `policy-${def.key}-help`;
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium text-ink">
          {def.label}
        </p>
        <p id={helpId} className="mt-0.5 text-xs text-ink-mute">
          {def.help}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={helpId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full",
          "transition-colors duration-150 focus:outline-none",
          "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-accent" : "bg-line-strong"
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow-card transition-transform duration-150",
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
          </span>
        ) : null}
      </button>
    </div>
  );
}
