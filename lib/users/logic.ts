/**
 * Pure, dependency-free user-management logic (FR-USER-01).
 *
 * Extracted so it can be unit-tested without Prisma/Auth/email. Covers the two
 * pieces of business logic that are easy to get subtly wrong and dangerous to
 * regress: the "last active Admin" lockout guard, and invite-token expiry.
 */

export type Role = "ADMIN" | "EDITOR" | "AUTHOR" | "CONTRIBUTOR" | "VIEWER";
export type UserStatus = "INVITED" | "ACTIVE" | "SUSPENDED";

/** Minimal user shape the lockout guard needs to reason about. */
export interface AdminGuardUser {
  id: string;
  role: Role;
  status: UserStatus;
}

/** The mutation being applied to `targetId` (only role/status matter here). */
export interface UserChange {
  role?: Role;
  status?: UserStatus;
}

/**
 * Returns true when applying `change` to `targetId` would remove the LAST
 * remaining ACTIVE Admin from the system — i.e. an Admin trying to demote or
 * suspend themselves (or another sole Admin) into total lockout.
 *
 * The check is applied to the post-change snapshot: the target user is
 * suspended/demoted out of the ACTIVE-Admin set, then we verify at least one
 * ACTIVE Admin still remains. A no-op change (still ACTIVE Admin) is allowed.
 */
export function isLastActiveAdmin(
  users: AdminGuardUser[],
  targetId: string,
  change: UserChange
): boolean {
  const target = users.find((u) => u.id === targetId);
  if (!target) return false;

  // What will the target look like after the change?
  const nextRole = change.role ?? target.role;
  const nextStatus = change.status ?? target.status;
  const targetStaysActiveAdmin = nextRole === "ADMIN" && nextStatus === "ACTIVE";

  // No-op (or change that keeps them an active admin) can never cause lockout.
  if (targetStaysActiveAdmin) return false;

  // The target currently counts as an active admin only if it is one today.
  const targetWasActiveAdmin =
    target.role === "ADMIN" && target.status === "ACTIVE";
  if (!targetWasActiveAdmin) return false;

  // Count OTHER active admins that would remain after the change.
  const remaining = users.filter(
    (u) =>
      u.id !== targetId && u.role === "ADMIN" && u.status === "ACTIVE"
  ).length;

  return remaining === 0;
}

/**
 * Returns true when an invite token is still valid (not yet expired) at `now`.
 * A missing/blank token or missing expiry is treated as invalid.
 */
export function isInviteValid(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!expiresAt) return false;
  const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return false;
  return exp.getTime() > now.getTime();
}

/** Invite token lifetime: 7 days (FR-USER-01). */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Compute the expiry timestamp for a freshly minted invite. */
export function inviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITE_TTL_MS);
}

/**
 * Slug seed from a name or email: kebab-case, [a-z0-9-], diacritics stripped.
 * Falls back to "author" for empty/symbol-only input. Mirrors lib/content slug
 * rules so author-profile slugs look like content slugs.
 */
export function authorSlugSeed(nameOrEmail: string): string {
  const local = nameOrEmail.includes("@")
    ? nameOrEmail.split("@")[0]
    : nameOrEmail;
  const slug = local
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug.length > 0 ? slug : "author";
}
