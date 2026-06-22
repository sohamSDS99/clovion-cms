import { Suspense } from "react";
import { AcceptInviteForm } from "@/components/users/AcceptInviteForm";

/**
 * Public invite-acceptance page (FR-USER-01). Reads ?token and renders a
 * set-password form. No session required — the token is the gate. Wrapped in
 * Suspense because the client form reads search params.
 */
export default function AcceptInvitePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-12 text-ink">
      <Suspense fallback={null}>
        <AcceptInviteForm />
      </Suspense>
    </main>
  );
}
