"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { InlineError } from "@/components/ui/Feedback";
import { api, errorMessage } from "@/lib/ui/client";

/**
 * Set-password form for invite acceptance (FR-USER-01). POSTs token + password
 * (+ optional name) to /api/users/accept. On success shows an "Account ready"
 * state with a link to /login (we never auto-login). Handles missing/invalid/
 * expired tokens with a generic message (no account enumeration).
 */
export function AcceptInviteForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Card className="w-full max-w-md px-6 py-8 text-center">
        <h1 className="font-display text-xl font-semibold">Invalid invite link</h1>
        <p className="mt-2 text-sm text-ink-mute">
          This link is missing its token. Ask an administrator to re-send your
          invite.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
        >
          Go to sign in
        </Link>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="w-full max-w-md px-6 py-8 text-center">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="font-display text-xl font-semibold">Account ready</h1>
        <p className="mt-2 text-sm text-ink-mute">
          Your password is set. You can now sign in to Clovion CMS.
        </p>
        <Link href="/login" className="mt-5 inline-block">
          <Button variant="primary">Go to sign in</Button>
        </Link>
      </Card>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post<{ ok: true }>("/api/users/accept", {
        token,
        password,
        name: name.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md px-6 py-8">
      <div className="mb-5 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded bg-accent text-sm font-bold text-white">
          C
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">Clovion</span>
      </div>
      <h1 className="font-display text-xl font-semibold">Set your password</h1>
      <p className="mt-1 text-sm text-ink-mute">
        Choose a password to activate your account.
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        {error ? <InlineError message={error} /> : null}
        <Input
          label="Name"
          hint="optional"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
        <Input
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="at least 8 characters"
        />
        <Input
          label="Confirm password"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button type="submit" variant="primary" loading={submitting} className="mt-1">
          Activate account
        </Button>
      </form>
    </Card>
  );
}
