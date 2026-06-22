/**
 * Content lifecycle state machine (FR-CONTENT-08).
 *
 * Defines which (fromStatus, action) pairs are STRUCTURALLY valid and what
 * target status they produce. This layer is concerned only with state
 * validity — role/permission/policy gating lives in `permissions.ts`.
 *
 * Any (from, action) pair not present in `TRANSITIONS` is INVALID and maps to
 * HTTP 409 (Conflict) at the API layer.
 *
 * Note on `draft -> scheduled` / `draft -> published`: these are structurally
 * valid transitions here. The PRD note "[only if self-publish allowed]" is a
 * PERMISSION/POLICY constraint and is enforced in `permissions.ts`
 * (canPerformTransition), not at the state level.
 */

import type { ContentStatus, TransitionAction } from "./types";

/**
 * Transition table: from-status -> action -> to-status.
 *
 * Per FR-CONTENT-08 allowed transitions:
 * - draft       -> in_review   (submit)
 * - draft       -> scheduled   (schedule)        [policy: self-publish]
 * - draft       -> published   (publish_now)     [policy: self-publish]
 * - in_review   -> draft        (reject)
 * - in_review   -> scheduled    (schedule)
 * - in_review   -> published    (approve_publish / publish_now)
 * - scheduled   -> published    (auto_publish)   [system, scheduled job]
 * - scheduled   -> draft        (cancel_schedule)
 * - scheduled   -> unpublished  (unpublish)
 * - published   -> unpublished  (unpublish)
 * - published   -> archived     (archive)
 * - unpublished -> draft        (restore_to_draft)
 * - unpublished -> published    (publish_now)
 * - unpublished -> archived     (archive)
 * - archived    -> draft        (restore_to_draft)
 */
export const TRANSITIONS: Readonly<
  Record<ContentStatus, Partial<Record<TransitionAction, ContentStatus>>>
> = {
  DRAFT: {
    submit: "IN_REVIEW",
    schedule: "SCHEDULED",
    publish_now: "PUBLISHED",
  },
  IN_REVIEW: {
    reject: "DRAFT",
    schedule: "SCHEDULED",
    approve_publish: "PUBLISHED",
    publish_now: "PUBLISHED",
  },
  SCHEDULED: {
    auto_publish: "PUBLISHED",
    cancel_schedule: "DRAFT",
    unpublish: "UNPUBLISHED",
  },
  PUBLISHED: {
    unpublish: "UNPUBLISHED",
    archive: "ARCHIVED",
  },
  UNPUBLISHED: {
    restore_to_draft: "DRAFT",
    publish_now: "PUBLISHED",
    archive: "ARCHIVED",
  },
  ARCHIVED: {
    restore_to_draft: "DRAFT",
  },
} as const;

/**
 * Resolve the target status for a (from, action) pair.
 * @returns the target ContentStatus, or `null` if the transition is invalid.
 */
export function getTargetStatus(
  from: ContentStatus,
  action: TransitionAction
): ContentStatus | null {
  const target = TRANSITIONS[from]?.[action];
  return target ?? null;
}

/** True when (from, action) is a structurally valid transition. */
export function isTransitionAllowed(
  from: ContentStatus,
  action: TransitionAction
): boolean {
  return getTargetStatus(from, action) !== null;
}

/** List every action that is structurally valid from a given status. */
export function allowedActionsFrom(from: ContentStatus): TransitionAction[] {
  return Object.keys(TRANSITIONS[from] ?? {}) as TransitionAction[];
}
