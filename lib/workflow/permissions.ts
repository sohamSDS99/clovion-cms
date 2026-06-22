/**
 * Role-gated transition authorization (PRD §3 permission matrix + org policy).
 *
 * Two layers of authorization exist for any transition:
 *   1. STATE validity  — see stateMachine.ts (isTransitionAllowed) -> 409
 *   2. ROLE validity    — this file (canPerformTransition)          -> 403
 *
 * `authorizeTransition` combines both and reports which gate failed.
 */

import type { ContentStatus, ContentType, Role, TransitionAction } from "./types";
import { isTransitionAllowed } from "./stateMachine";

/** Org-level policy toggles that can widen what Authors may self-serve. */
export interface WorkflowPolicy {
  /** When true, Authors may publish/schedule their own content directly. */
  selfPublish: boolean;
  /** When true, Authors may fast-publish their own NEWS content directly. */
  newsFastPublish: boolean;
}

export interface CanPerformArgs {
  role: Role;
  action: TransitionAction;
  isOwner: boolean;
  policy: WorkflowPolicy;
  contentType: ContentType;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

const deny = (reason: string): PermissionResult => ({ allowed: false, reason });
const allow = (): PermissionResult => ({ allowed: true });

/** Admin/Editor are the privileged management roles per §3. */
function isManager(role: Role): boolean {
  return role === "ADMIN" || role === "EDITOR";
}

/**
 * Does org policy grant an Author the ability to self-publish this content?
 * True when global self-publish is on, OR news-fast-publish is on for NEWS.
 */
function authorSelfPublishAllowed(
  policy: WorkflowPolicy,
  contentType: ContentType
): boolean {
  return policy.selfPublish || (policy.newsFastPublish && contentType === "NEWS");
}

/**
 * Role-level authorization for a transition action (PRD §3 matrix).
 * Does NOT consider whether the state transition itself is valid — use
 * `authorizeTransition` for the combined check.
 */
export function canPerformTransition(args: CanPerformArgs): PermissionResult {
  const { role, action, isOwner, policy, contentType } = args;

  // SYSTEM action: auto_publish is invoked by the scheduled-job worker, never
  // by an end user, so it is always permitted at the permission layer. (State
  // validity — only valid from SCHEDULED — is still enforced separately.)
  if (action === "auto_publish") {
    return allow();
  }

  // VIEWER is strictly read-only.
  if (role === "VIEWER") {
    return deny("VIEWER is read-only and cannot perform transitions.");
  }

  switch (action) {
    case "submit": {
      // Submit for review: Admin/Editor always; Author/Contributor own only.
      if (isManager(role)) return allow();
      if (role === "AUTHOR" || role === "CONTRIBUTOR") {
        return isOwner
          ? allow()
          : deny(`${role} may only submit their own content.`);
      }
      return deny(`${role} cannot submit content.`);
    }

    case "reject":
    case "approve_publish": {
      // Review decisions are Admin/Editor only.
      if (isManager(role)) return allow();
      return deny(`Only Admin/Editor may ${action}.`);
    }

    case "schedule":
    case "publish_now": {
      // Admin/Editor always. Author only with self-publish policy AND ownership.
      // Contributor never.
      if (isManager(role)) return allow();
      if (role === "AUTHOR") {
        if (!authorSelfPublishAllowed(policy, contentType)) {
          return deny("Author self-publish is not enabled by policy.");
        }
        return isOwner
          ? allow()
          : deny("Author may only publish/schedule their own content.");
      }
      return deny(`${role} cannot ${action}.`);
    }

    case "cancel_schedule": {
      // Admin/Editor always; Author if owner AND self-publish policy applies.
      if (isManager(role)) return allow();
      if (role === "AUTHOR") {
        if (!authorSelfPublishAllowed(policy, contentType)) {
          return deny("Author self-publish is not enabled by policy.");
        }
        return isOwner
          ? allow()
          : deny("Author may only cancel scheduling on their own content.");
      }
      return deny(`${role} cannot cancel scheduling.`);
    }

    case "unpublish":
    case "archive":
    case "restore_to_draft": {
      // Lifecycle management reserved to Admin/Editor.
      if (isManager(role)) return allow();
      return deny(`Only Admin/Editor may ${action}.`);
    }

    default: {
      // Exhaustiveness guard.
      const _never: never = action;
      return deny(`Unknown action: ${String(_never)}`);
    }
  }
}

export interface AuthorizeArgs extends CanPerformArgs {
  /** Current status the item is transitioning FROM. */
  from: ContentStatus;
}

export interface AuthorizeResult {
  allowed: boolean;
  /** 409 = invalid state transition; 403 = role not permitted. */
  code?: 409 | 403;
  reason?: string;
}

/**
 * Combined gate: checks STATE validity first (409 on failure), then ROLE
 * validity (403 on failure). Returns allowed:true only when both pass.
 */
export function authorizeTransition(args: AuthorizeArgs): AuthorizeResult {
  const { from, action } = args;

  // 1. State validity -> 409 Conflict.
  if (!isTransitionAllowed(from, action)) {
    return {
      allowed: false,
      code: 409,
      reason: `Invalid transition: cannot '${action}' from status '${from}'.`,
    };
  }

  // 2. Role validity -> 403 Forbidden.
  const perm = canPerformTransition(args);
  if (!perm.allowed) {
    return { allowed: false, code: 403, reason: perm.reason };
  }

  return { allowed: true };
}
