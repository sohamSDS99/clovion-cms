/**
 * User management + invites + author-profile editing service
 * (FR-USER-01, FR-USER-02).
 *
 * All mutations except `acceptInvite` require an authenticated actor and an
 * RBAC capability (manage_users / edit_*_author_profile). `acceptInvite` is the
 * single unauthenticated mutation and is strictly token + expiry gated.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, type Role, type UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveAvatarUrls } from "@/lib/public/query";
import { assertCan, AuthzError } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/audit/service";
import { sendInviteEmail } from "@/lib/email/send";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@/lib/api/http";
import {
  authorSlugSeed,
  inviteExpiry,
  isInviteValid,
  isLastActiveAdmin,
  type AdminGuardUser,
} from "./logic";
import type {
  AcceptInviteInput,
  InviteUserInput,
  UpdateAuthorProfileInput,
  UpdateUserInput,
} from "./schemas";

const BCRYPT_ROUNDS = 12;

/** Fields safe to return to the admin UI (never passwordHash/inviteToken). */
const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  authorProfileId: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  authorProfile: {
    select: {
      id: true,
      displayName: true,
      slug: true,
      isPublic: true,
      avatarAssetId: true,
    },
  },
} satisfies Prisma.UserSelect;

export type UserListItem = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export interface ListUsersFilters {
  role?: Role;
  status?: UserStatus;
  q?: string;
}

/** List users (with their author profile) for the admin table. */
export async function listUsers(
  filters: ListUsersFilters = {}
): Promise<UserListItem[]> {
  return prisma.user.findMany({
    where: {
      role: filters.role,
      status: filters.status,
      OR: filters.q
        ? [
            { email: { contains: filters.q, mode: "insensitive" } },
            { name: { contains: filters.q, mode: "insensitive" } },
          ]
        : undefined,
    },
    select: userSelect,
    orderBy: { createdAt: "desc" },
  });
}

/** Generate a fresh single-use invite token (256 bits, hex). */
function mintInviteToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Find a free author-profile slug derived from `seed`, appending -2, -3, … on
 * collision. `tx` keeps the lookup inside the invite transaction.
 */
async function uniqueAuthorSlug(
  tx: Prisma.TransactionClient,
  seed: string,
  excludeId?: string
): Promise<string> {
  const root = authorSlugSeed(seed);
  const existing = await tx.authorProfile.findMany({
    where: {
      slug: { startsWith: root },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { slug: true },
  });
  const taken = new Set(existing.map((r) => r.slug));
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

export interface InviteResult {
  user: UserListItem;
  /** Always returned so an Admin can copy the link when SMTP isn't set up. */
  acceptUrl: string;
  delivered: boolean;
}

/**
 * Invite a user (manage_users). Creates an INVITED user with a fresh token +
 * 7-day expiry and a paired (private) AuthorProfile — unless the role is VIEWER,
 * which has no profile. Emails the accept link and returns it for copy/paste.
 */
export async function inviteUser(
  actor: SessionUser,
  input: InviteUserInput
): Promise<InviteResult> {
  assertCan(actor.role, "manage_users");

  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError("A user with this email already exists.");
  }

  const token = mintInviteToken();
  const expires = inviteExpiry();
  const wantsProfile = input.role !== "VIEWER";
  const displayName = input.name?.trim() || email;

  const user = await prisma.$transaction(async (tx) => {
    let authorProfileId: string | undefined;
    if (wantsProfile) {
      const slug = await uniqueAuthorSlug(tx, input.name || email);
      const profile = await tx.authorProfile.create({
        data: {
          displayName,
          slug,
          isPublic: false,
          createdById: actor.id,
          updatedById: actor.id,
        },
        select: { id: true },
      });
      authorProfileId = profile.id;
    }

    return tx.user.create({
      data: {
        email,
        name: input.name?.trim() || null,
        role: input.role,
        status: "INVITED",
        inviteToken: token,
        inviteTokenExpires: expires,
        ...(authorProfileId ? { authorProfileId } : {}),
      },
      select: userSelect,
    });
  });

  await recordAudit({
    actorId: actor.id,
    entityType: "user",
    entityId: user.id,
    action: "created",
    diff: { email, role: input.role, invited: true },
  });

  const { delivered, acceptUrl } = await sendInviteEmail({
    to: email,
    name: input.name ?? null,
    token,
    role: input.role,
  });

  // NEVER return the raw token in the body; the acceptUrl carries it for the
  // Admin to copy when email delivery is unavailable.
  return { user, acceptUrl, delivered };
}

/**
 * Update a user's role and/or status (manage_users). Blocks any change that
 * would remove the last ACTIVE Admin (lockout guard, ConflictError).
 */
export async function updateUser(
  actor: SessionUser,
  id: string,
  patch: UpdateUserInput
): Promise<UserListItem> {
  assertCan(actor.role, "manage_users");

  const current = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, status: true },
  });
  if (!current) throw new NotFoundError("User not found.");

  // Lockout guard: evaluate against the full set of users.
  const all = await prisma.user.findMany({
    select: { id: true, role: true, status: true },
  });
  if (
    isLastActiveAdmin(all as AdminGuardUser[], id, {
      role: patch.role,
      status: patch.status,
    })
  ) {
    throw new ConflictError(
      "Cannot suspend or demote the last active Admin — promote another Admin first."
    );
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(patch.role ? { role: patch.role } : {}),
      ...(patch.status ? { status: patch.status } : {}),
    },
    select: userSelect,
  });

  await recordAudit({
    actorId: actor.id,
    entityType: "user",
    entityId: id,
    action: "updated",
    diff: {
      from: { role: current.role, status: current.status },
      to: { role: updated.role, status: updated.status },
    },
  });

  return updated;
}

/**
 * Permanently remove a user (manage_users). Cascades the user's accounts +
 * sessions (FK onDelete: Cascade); the AuthorProfile is intentionally LEFT
 * intact so existing bylines on published content are preserved. Guards: an
 * actor can't delete themselves, and the last active Admin can't be removed.
 */
export async function deleteUser(actor: SessionUser, id: string): Promise<void> {
  assertCan(actor.role, "manage_users");

  if (id === actor.id) {
    throw new ConflictError("You can't delete your own account.");
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, status: true },
  });
  if (!target) throw new NotFoundError("User not found.");

  // Lockout guard: deletion is equivalent to removing the user entirely, so
  // treat it as suspending+demoting for the last-admin check.
  const all = await prisma.user.findMany({
    select: { id: true, role: true, status: true },
  });
  if (isLastActiveAdmin(all as AdminGuardUser[], id, { status: "SUSPENDED" })) {
    throw new ConflictError(
      "Cannot delete the last active Admin — promote another Admin first."
    );
  }

  await prisma.user.delete({ where: { id } });

  await recordAudit({
    actorId: actor.id,
    entityType: "user",
    entityId: id,
    action: "deleted",
    diff: { email: target.email, role: target.role },
  });
}

/**
 * Consume an invite (UNAUTHENTICATED). Finds the user by single-use token with
 * a non-expired expiry, sets the password, activates them, and clears the
 * token. Never reveals whether an email exists; all failures are a generic 400.
 */
export async function acceptInvite(
  input: AcceptInviteInput
): Promise<{ ok: true }> {
  const user = await prisma.user.findUnique({
    where: { inviteToken: input.token },
    select: { id: true, inviteTokenExpires: true, status: true },
  });

  // Generic failure for missing token OR expired token — no enumeration.
  if (!user || !isInviteValid(user.inviteTokenExpires)) {
    throw new BadRequestError("This invite link is invalid or has expired.");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      status: "ACTIVE",
      inviteToken: null, // single-use: cleared on accept
      inviteTokenExpires: null,
      ...(input.name ? { name: input.name } : {}),
    },
  });

  await recordAudit({
    actorId: user.id,
    entityType: "user",
    entityId: user.id,
    action: "status_changed",
    diff: { accepted: true, status: "ACTIVE" },
  });

  // Do NOT auto-login: the client redirects to /login.
  return { ok: true };
}

/** Regenerate an invite token + expiry and resend the email (manage_users). */
export async function resendInvite(
  actor: SessionUser,
  id: string
): Promise<InviteResult> {
  assertCan(actor.role, "manage_users");

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, status: true },
  });
  if (!user) throw new NotFoundError("User not found.");
  if (user.status !== "INVITED") {
    throw new ConflictError("This user has already accepted their invite.");
  }

  const token = mintInviteToken();
  const expires = inviteExpiry();

  const updated = await prisma.user.update({
    where: { id },
    data: { inviteToken: token, inviteTokenExpires: expires },
    select: userSelect,
  });

  await recordAudit({
    actorId: actor.id,
    entityType: "user",
    entityId: id,
    action: "updated",
    diff: { inviteResent: true },
  });

  const { delivered, acceptUrl } = await sendInviteEmail({
    to: user.email,
    name: user.name,
    token,
    role: user.role,
  });

  return { user: updated, acceptUrl, delivered };
}

/* ── Author profiles (FR-USER-02) ──────────────────────────────────────── */

const profileSelect = {
  id: true,
  displayName: true,
  slug: true,
  title: true,
  bio: true,
  avatarAssetId: true,
  socialLinks: true,
  isPublic: true,
  isGhost: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AuthorProfileSelect;

export type AuthorProfilePayload = Prisma.AuthorProfileGetPayload<{
  select: typeof profileSelect;
}>;

/** The acting user's own author profile, or null (e.g. Viewers have none). */
export async function getMyProfile(
  user: SessionUser
): Promise<AuthorProfilePayload | null> {
  if (!user.authorProfileId) return null;
  return prisma.authorProfile.findUnique({
    where: { id: user.authorProfileId },
    select: profileSelect,
  });
}

/** All author profiles (id + display name), for the editor's byline picker. */
export async function listAuthorProfiles(): Promise<
  { id: string; displayName: string }[]
> {
  return prisma.authorProfile.findMany({
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });
}

/** Full author-profile row for the admin oversight screen (Admin only). */
const adminProfileSelect = {
  id: true,
  displayName: true,
  slug: true,
  title: true,
  bio: true,
  avatarAssetId: true,
  socialLinks: true,
  isPublic: true,
  isGhost: true,
  createdAt: true,
  createdById: true,
} satisfies Prisma.AuthorProfileSelect;

export interface AuthorProfileAdminRow {
  id: string;
  displayName: string;
  slug: string;
  title: string | null;
  bio: string | null;
  avatarAssetId: string | null;
  avatarUrl: string | null;
  socialLinks: Record<string, string>;
  isPublic: boolean;
  isGhost: boolean;
  createdAt: string;
  createdByEmail: string | null;
}

/**
 * All author profiles with the columns the admin oversight screen needs
 * (FR-USER-02). `createdById` is an FK-less UUID column, so the creator email is
 * resolved via a single batched `in` lookup against User. Callers MUST gate this
 * behind `edit_others_author_profile` in the route.
 */
export async function listAuthorProfilesAdmin(): Promise<AuthorProfileAdminRow[]> {
  const rows = await prisma.authorProfile.findMany({
    orderBy: { createdAt: "desc" },
    select: adminProfileSelect,
    // Bound the oversight listing so it can't load an unbounded table at once.
    take: 500,
  });

  // Resolve createdById -> email via one batched lookup (no FK on the column).
  const creatorIds = [
    ...new Set(rows.map((r) => r.createdById).filter((v): v is string => !!v)),
  ];
  const creators = creatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, email: true },
      })
    : [];
  const emailById = new Map(creators.map((u) => [u.id, u.email]));

  // Resolve avatar thumbnails (FK-less asset ids) in one batched lookup so the
  // admin editor can show the current photo instead of a placeholder.
  const avatars = await resolveAvatarUrls(rows.map((r) => r.avatarAssetId));

  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    slug: r.slug,
    title: r.title,
    bio: r.bio,
    avatarAssetId: r.avatarAssetId,
    avatarUrl: r.avatarAssetId ? avatars.get(r.avatarAssetId) ?? null : null,
    socialLinks: (r.socialLinks ?? {}) as Record<string, string>,
    isPublic: r.isPublic,
    isGhost: r.isGhost,
    createdAt: r.createdAt.toISOString(),
    createdByEmail: r.createdById ? emailById.get(r.createdById) ?? null : null,
  }));
}

/**
 * Update an author profile (FR-USER-02). Requires edit_own_author_profile when
 * editing the actor's own profile, otherwise edit_others_author_profile (Admin).
 * Slug is editable + kept unique (ConflictError on collision).
 */
export async function updateAuthorProfile(
  actor: SessionUser,
  profileId: string,
  patch: UpdateAuthorProfileInput
): Promise<AuthorProfilePayload> {
  const isOwn = actor.authorProfileId === profileId;
  if (isOwn) {
    assertCan(actor.role, "edit_own_author_profile");
  } else {
    // Editing someone else's profile is Admin-only.
    assertCan(actor.role, "edit_others_author_profile");
  }

  const existing = await prisma.authorProfile.findUnique({
    where: { id: profileId },
    select: { id: true, slug: true },
  });
  if (!existing) throw new NotFoundError("Author profile not found.");

  // Enforce slug uniqueness up-front for a clean 409 (instead of a raw P2002).
  if (patch.slug && patch.slug !== existing.slug) {
    const clash = await prisma.authorProfile.findUnique({
      where: { slug: patch.slug },
      select: { id: true },
    });
    if (clash && clash.id !== profileId) {
      throw new ConflictError("That slug is already in use.");
    }
  }

  const updated = await prisma.authorProfile.update({
    where: { id: profileId },
    data: {
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.socialLinks !== undefined
        ? { socialLinks: patch.socialLinks as Prisma.InputJsonValue }
        : {}),
      ...(patch.avatarAssetId !== undefined
        ? { avatarAssetId: patch.avatarAssetId }
        : {}),
      ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
      updatedById: actor.id,
    },
    select: profileSelect,
  });

  await recordAudit({
    actorId: actor.id,
    entityType: "author_profile",
    entityId: profileId,
    action: "updated",
    diff: { fields: Object.keys(patch), own: isOwn },
  });

  return updated;
}

export { AuthzError };
