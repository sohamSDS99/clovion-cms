import { auth } from "@/auth";
import {
  assertCan,
  AuthzError,
  type AuthzContext,
  type Capability,
  type Role,
} from "@/lib/auth/rbac";

/** The authenticated session user shape we rely on (see types/next-auth.d.ts). */
export interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  role: Role;
  status: "INVITED" | "ACTIVE" | "SUSPENDED";
  authorProfileId?: string | null;
}

/** Thin wrapper around Auth.js `auth()`. */
export async function getSession() {
  return auth();
}

/** Returns the session user or throws AuthzError(401) if unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session?.user) {
    throw new AuthzError("Authentication required.", 401);
  }
  return session.user as SessionUser;
}

/**
 * Ensures the current user is authenticated AND authorized for `capability`.
 * Throws AuthzError(401) when unauthenticated, AuthzError(403) when denied.
 * Returns the session user on success.
 */
export async function requireCapability(
  capability: Capability,
  ctx?: AuthzContext
): Promise<SessionUser> {
  const user = await requireUser();
  assertCan(user.role, capability, ctx);
  return user;
}
