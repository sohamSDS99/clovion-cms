/**
 * Lifecycle action UX helpers (FR-CONTENT-08/09).
 *
 * The server (lib/workflow) is the source of truth for what transitions are
 * legal and who may perform them; this module only drives the *UI affordances*
 * — which buttons to render for the current status, their labels, intent, and
 * a best-effort role gate so unavailable actions are disabled rather than
 * hidden. Pure (no React) for easy unit testing.
 */

import type { ContentStatus, Role, TransitionAction } from "./types";

export interface ActionSpec {
  action: TransitionAction;
  label: string;
  /** Visual intent for the Button variant. */
  intent: "primary" | "secondary" | "ghost" | "danger";
  /** True when this action opens the schedule date-time picker. */
  needsSchedule?: boolean;
}

/**
 * Actions surfaced from each status, in display order. Mirrors the structurally
 * valid transitions in lib/workflow/stateMachine.ts (excluding the system-only
 * `auto_publish`).
 */
const ACTIONS_BY_STATUS: Record<ContentStatus, ActionSpec[]> = {
  DRAFT: [
    { action: "submit", label: "Submit for review", intent: "primary" },
    { action: "schedule", label: "Schedule", intent: "secondary", needsSchedule: true },
    { action: "publish_now", label: "Publish now", intent: "secondary" },
  ],
  IN_REVIEW: [
    { action: "approve_publish", label: "Approve & publish", intent: "primary" },
    { action: "schedule", label: "Schedule", intent: "secondary", needsSchedule: true },
    { action: "reject", label: "Reject to draft", intent: "ghost" },
  ],
  SCHEDULED: [
    { action: "cancel_schedule", label: "Cancel schedule", intent: "secondary" },
    { action: "unpublish", label: "Unpublish", intent: "ghost" },
  ],
  PUBLISHED: [
    { action: "unpublish", label: "Unpublish", intent: "secondary" },
    { action: "archive", label: "Archive", intent: "ghost" },
  ],
  UNPUBLISHED: [
    { action: "publish_now", label: "Re-publish", intent: "primary" },
    { action: "restore_to_draft", label: "Back to draft", intent: "secondary" },
    { action: "archive", label: "Archive", intent: "ghost" },
  ],
  ARCHIVED: [
    { action: "restore_to_draft", label: "Restore to draft", intent: "secondary" },
  ],
};

export function actionsForStatus(status: ContentStatus): ActionSpec[] {
  return ACTIONS_BY_STATUS[status] ?? [];
}

const MANAGER_ROLES: Role[] = ["ADMIN", "EDITOR"];
/** Review decisions + lifecycle management reserved to Admin/Editor. */
const MANAGER_ONLY: ReadonlySet<TransitionAction> = new Set([
  "approve_publish",
  "reject",
  "unpublish",
  "archive",
  "restore_to_draft",
  "cancel_schedule",
]);
/** Publish/schedule require manager OR an author self-publishing their own. */
const PUBLISH_ACTIONS: ReadonlySet<TransitionAction> = new Set([
  "publish_now",
  "schedule",
]);

/**
 * Best-effort UX gate: should this action be enabled for the given role?
 * Conservative — the server still authorizes. `selfPublish` reflects org policy
 * (defaults false) so authors don't see a publish button they can't use.
 */
export function canRoleAttempt(
  role: Role,
  action: TransitionAction,
  opts: { isOwner?: boolean; selfPublish?: boolean } = {}
): boolean {
  if (role === "VIEWER") return false;
  const isManager = MANAGER_ROLES.includes(role);
  if (isManager) return true;

  if (action === "submit") {
    // Authors/contributors may submit their own.
    return Boolean(opts.isOwner);
  }
  if (MANAGER_ONLY.has(action)) return false;
  if (PUBLISH_ACTIONS.has(action)) {
    return role === "AUTHOR" && Boolean(opts.isOwner) && Boolean(opts.selfPublish);
  }
  return false;
}
