import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { UsersManager } from "@/components/users/UsersManager";

/**
 * Admin user management (FR-USER-01). Server-gated to ADMIN (the API is still
 * authoritative); non-admins are redirected to the dashboard.
 */
export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/");

  return <UsersManager currentUserId={session.user.id} />;
}
