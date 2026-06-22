"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { actionsForStatus, canRoleAttempt } from "@/lib/ui/actions";
import { localInputToIso, statusBadge } from "@/lib/ui/format";
import type {
  ContentItem,
  Role,
  TransitionAction,
} from "@/lib/ui/types";

/**
 * Lifecycle action bar (FR-CONTENT-08/09). Renders the transitions valid for the
 * current status; actions the role can't perform are disabled (best-effort UX —
 * the server is the source of truth). `schedule` opens a date-time picker.
 */
export function ActionBar({
  item,
  role,
  isOwner,
  busy,
  onTransition,
}: {
  item: ContentItem;
  role: Role;
  isOwner: boolean;
  busy: boolean;
  onTransition: (action: TransitionAction, scheduledAt?: string) => void;
}) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleErr, setScheduleErr] = useState<string | null>(null);

  const actions = actionsForStatus(item.status);
  const meta = statusBadge(item.status);

  function confirmSchedule() {
    const iso = localInputToIso(scheduleAt);
    if (!iso || new Date(iso).getTime() <= Date.now()) {
      setScheduleErr("Pick a date and time in the future.");
      return;
    }
    setScheduleErr(null);
    setScheduleOpen(false);
    onTransition("schedule", iso);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 flex items-center gap-2">
          <span className="text-xs text-ink-mute">Status</span>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
        <span className="hidden h-5 w-px bg-line sm:block" />
        {actions.map((spec) => {
          const enabled = canRoleAttempt(role, spec.action, { isOwner });
          return (
            <Button
              key={spec.action}
              variant={spec.intent}
              size="sm"
              disabled={!enabled || busy}
              title={!enabled ? "Your role can't perform this action" : undefined}
              onClick={() => {
                if (spec.needsSchedule) setScheduleOpen(true);
                else onTransition(spec.action);
              }}
            >
              {spec.label}
            </Button>
          );
        })}
      </div>

      <Modal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Schedule publish"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={confirmSchedule}>Schedule</Button>
          </>
        }
      >
        <Input
          type="datetime-local"
          label="Publish at"
          value={scheduleAt}
          onChange={(e) => { setScheduleAt(e.target.value); setScheduleErr(null); }}
          error={scheduleErr}
          autoFocus
        />
        <p className="mt-2 text-xs text-ink-mute">
          The item publishes automatically at this local time.
        </p>
      </Modal>
    </>
  );
}
