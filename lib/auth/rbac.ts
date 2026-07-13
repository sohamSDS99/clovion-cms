/**
 * Pure, dependency-free RBAC capability matrix for Clovion CMS.
 *
 * This module intentionally imports nothing (no Prisma, no next-auth) so it
 * stays trivially unit-testable and edge-safe. It encodes the CMS permission
 * spec as a per-capability resolver function keyed by role.
 */

export type Role = "ADMIN" | "EDITOR" | "AUTHOR" | "CONTRIBUTOR" | "VIEWER";

export type Capability =
  | "create_content"
  | "edit_content"
  | "delete_content"
  | "save_draft"
  | "submit_for_review"
  | "schedule_publish"
  | "publish_now"
  | "unpublish_archive"
  | "use_ai_write"
  | "upload_media"
  | "manage_media_library"
  | "edit_writing_sop"
  | "activate_writing_sop"
  | "manage_knowledge_base"
  | "configure_ai_provider"
  | "manage_users"
  | "edit_own_author_profile"
  | "edit_others_author_profile"
  | "view_audit_log";

export type ContentType = "BLOG" | "RESEARCH" | "WEBINAR" | "NEWS" | "RESOURCE" | "COURSE" | "FAQ";

export interface AuthzContext {
  /** True when the acting user owns the target resource. */
  isOwner?: boolean;
  /** True when the target content is currently a draft. */
  isDraft?: boolean;
  /** Publishing policy flags that gate AUTHOR self-publishing. */
  policy?: {
    selfPublish: boolean;
    newsFastPublish: boolean;
  };
  /** Content type of the target resource. */
  contentType?: ContentType;
}

/** A rule resolves to a boolean given the authorization context. */
type Rule = (ctx: AuthzContext) => boolean;

const ALLOW: Rule = () => true;
const DENY: Rule = () => false;
const OWN: Rule = (ctx) => ctx.isOwner === true;

/** AUTHOR delete: own AND draft-only. */
const OWN_DRAFT_ONLY: Rule = (ctx) => ctx.isOwner === true && ctx.isDraft === true;

/** AUTHOR schedule/publish: own AND (selfPublish OR (newsFastPublish AND NEWS)). */
const OWN_PLUS_POLICY: Rule = (ctx) => {
  if (ctx.isOwner !== true) return false;
  const policy = ctx.policy;
  if (!policy) return false;
  return (
    policy.selfPublish === true ||
    (policy.newsFastPublish === true && ctx.contentType === "NEWS")
  );
};

/**
 * The capability matrix. Each capability maps every role to a Rule.
 * Roles not present in a given capability's map default to DENY.
 */
const MATRIX: Record<Capability, Partial<Record<Role, Rule>>> = {
  create_content: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: ALLOW,
    CONTRIBUTOR: ALLOW,
    VIEWER: DENY,
  },
  edit_content: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: OWN,
    CONTRIBUTOR: OWN,
    VIEWER: DENY,
  },
  delete_content: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: OWN_DRAFT_ONLY,
    CONTRIBUTOR: DENY,
    VIEWER: DENY,
  },
  save_draft: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: OWN,
    CONTRIBUTOR: OWN,
    VIEWER: DENY,
  },
  submit_for_review: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: OWN,
    CONTRIBUTOR: OWN,
    VIEWER: DENY,
  },
  schedule_publish: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: OWN_PLUS_POLICY,
    CONTRIBUTOR: DENY,
    VIEWER: DENY,
  },
  publish_now: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: OWN_PLUS_POLICY,
    CONTRIBUTOR: DENY,
    VIEWER: DENY,
  },
  unpublish_archive: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: DENY,
    CONTRIBUTOR: DENY,
    VIEWER: DENY,
  },
  use_ai_write: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: ALLOW,
    CONTRIBUTOR: ALLOW,
    VIEWER: DENY,
  },
  upload_media: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: ALLOW,
    CONTRIBUTOR: ALLOW,
    VIEWER: DENY,
  },
  manage_media_library: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: DENY,
    CONTRIBUTOR: DENY,
    VIEWER: DENY,
  },
  // EDITOR may edit the writing SOP but may NOT activate it (separate capability).
  edit_writing_sop: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: DENY,
    CONTRIBUTOR: DENY,
    VIEWER: DENY,
  },
  activate_writing_sop: {
    ADMIN: ALLOW,
    EDITOR: DENY,
    AUTHOR: DENY,
    CONTRIBUTOR: DENY,
    VIEWER: DENY,
  },
  manage_knowledge_base: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: DENY,
    CONTRIBUTOR: DENY,
    VIEWER: DENY,
  },
  configure_ai_provider: {
    ADMIN: ALLOW,
    EDITOR: DENY,
    AUTHOR: DENY,
    CONTRIBUTOR: DENY,
    VIEWER: DENY,
  },
  manage_users: {
    ADMIN: ALLOW,
    EDITOR: DENY,
    AUTHOR: DENY,
    CONTRIBUTOR: DENY,
    VIEWER: DENY,
  },
  edit_own_author_profile: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: ALLOW,
    CONTRIBUTOR: ALLOW,
    VIEWER: DENY,
  },
  edit_others_author_profile: {
    ADMIN: ALLOW,
    EDITOR: DENY,
    AUTHOR: DENY,
    CONTRIBUTOR: DENY,
    VIEWER: DENY,
  },
  view_audit_log: {
    ADMIN: ALLOW,
    EDITOR: ALLOW,
    AUTHOR: DENY,
    CONTRIBUTOR: DENY,
    VIEWER: DENY,
  },
};

/**
 * Returns true if `role` is allowed to perform `capability` under `ctx`.
 * Unknown role/capability combinations default to denied.
 */
export function can(
  role: Role,
  capability: Capability,
  ctx: AuthzContext = {}
): boolean {
  const rule = MATRIX[capability]?.[role];
  if (!rule) return false;
  return rule(ctx);
}

/** Thrown by assertCan/guards when an action is not permitted. */
export class AuthzError extends Error {
  readonly status: number;

  constructor(message = "Forbidden", status = 403) {
    super(message);
    this.name = "AuthzError";
    this.status = status;
    // Restore prototype chain for instanceof checks across transpilation.
    Object.setPrototypeOf(this, AuthzError.prototype);
  }
}

/**
 * Throws AuthzError(403) when `role` cannot perform `capability` under `ctx`.
 * Intended for use inside API route handlers.
 */
export function assertCan(
  role: Role,
  capability: Capability,
  ctx: AuthzContext = {}
): void {
  if (!can(role, capability, ctx)) {
    throw new AuthzError(
      `Role "${role}" is not permitted to "${capability}".`,
      403
    );
  }
}
