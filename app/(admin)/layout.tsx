import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { AppShell } from "@/components/shell/AppShell";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * Admin route-group layout (server component). Renders at "/" (the route group
 * is path-transparent). Gates the entire admin surface behind a session — the
 * API still enforces real authorization; this is the UX gate.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user;

  // Server action bound to the sign-out form in the shell.
  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <ToastProvider>
      <AppShell
        user={{
          name: user.name ?? null,
          email: user.email ?? "",
          role: user.role,
        }}
        signOutAction={handleSignOut}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
