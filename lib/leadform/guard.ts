/**
 * Shared authorization gate for lead-form admin routes.
 *
 * Lead forms are an editorial/config surface (PRD Q4): ADMIN and EDITOR may
 * manage them; everyone else is denied 403. Authentication failures surface as
 * 401 via `requireUser()`.
 */
import { AuthzError } from "@/lib/api/http";
import { requireUser, type SessionUser } from "@/lib/auth/guard";

export async function requireEditorOrAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!["ADMIN", "EDITOR"].includes(user.role)) {
    throw new AuthzError("Editors and admins only.", 403);
  }
  return user;
}
