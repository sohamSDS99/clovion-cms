import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthorProfilesManager } from "@/components/authors/AuthorProfilesManager";

/**
 * Admin → Author Profiles oversight screen (FR-USER-02). Lists every author
 * profile with search + filters, an invite-driven "Add Author Profile" flow,
 * and a per-row editor. The admin listing API is capability-gated server-side
 * (`edit_others_author_profile`); this page adds a role gate so non-admins are
 * redirected rather than shown a shell that 403s (defense-in-depth).
 */
export default async function AuthorProfilesPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");
  return <AuthorProfilesManager />;
}
