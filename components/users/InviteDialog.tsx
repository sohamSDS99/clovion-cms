"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { InlineError } from "@/components/ui/Feedback";
import { api, errorMessage } from "@/lib/ui/client";
import { CopyLink } from "./CopyLink";
import { ROLE_LABEL, ROLE_OPTIONS, type InviteResult } from "./types";
import type { Role } from "@/lib/ui/types";

/**
 * Invite dialog (FR-USER-01). Collects email + role (+ optional name), POSTs to
 * /api/users, then surfaces the accept link so the Admin can copy it when SMTP
 * isn't configured (delivered === false).
 */
export function InviteDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: (result: InviteResult) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("AUTHOR");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  function reset() {
    setEmail("");
    setName("");
    setRole("AUTHOR");
    setError(null);
    setResult(null);
    setSubmitting(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<InviteResult>("/api/users", {
        email: email.trim(),
        name: name.trim() || undefined,
        role,
      });
      setResult(res);
      onInvited(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={result ? "Invite sent" : "Invite a user"}
      footer={
        result ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close} type="button">
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="invite-form"
              loading={submitting}
            >
              Send invite
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">
            {result.delivered
              ? `An invite email was sent to ${result.user.email}.`
              : `Email isn't configured, so no message was sent. Copy the invite link below and share it with ${result.user.email}.`}
          </p>
          <CopyLink url={result.acceptUrl} />
          <p className="text-xs text-ink-mute">
            The link expires in 7 days and can be used once.
          </p>
        </div>
      ) : (
        <form id="invite-form" onSubmit={submit} className="flex flex-col gap-4">
          {error ? <InlineError message={error} /> : null}
          <Input
            label="Email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@company.com"
          />
          <Input
            label="Name"
            hint="optional"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
          <Select
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
          {role === "VIEWER" ? (
            <p className="text-xs text-ink-mute">
              Viewers have read-only access and no author profile.
            </p>
          ) : null}
        </form>
      )}
    </Modal>
  );
}
