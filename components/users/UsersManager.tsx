"use client";

import { useEffect, useState } from "react";
import { PageHeader, PageBody } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Field";
import { Loading, InlineError, EmptyState } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { api, errorMessage } from "@/lib/ui/client";
import { relativeTime } from "@/lib/ui/format";
import { InviteDialog } from "./InviteDialog";
import { CopyLink } from "./CopyLink";
import {
  ROLE_LABEL,
  ROLE_OPTIONS,
  STATUS_LABEL,
  statusTone,
  type InviteResult,
  type UserRow,
} from "./types";
import type { Role } from "@/lib/ui/types";

interface ListResponse {
  items: UserRow[];
}

/**
 * Admin users surface (FR-USER-01): table of users with role dropdown,
 * suspend/activate, resend-invite + copy-link affordances, and an invite
 * dialog. The API is authoritative; this component gates UX to Admins.
 */
export function UsersManager({ currentUserId }: { currentUserId: string }) {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resentLink, setResentLink] = useState<{ email: string; url: string } | null>(null);

  function load() {
    setUsers(null);
    setError(null);
    api
      .get<ListResponse>("/api/users")
      .then((r) => setUsers(r.items))
      .catch((e) => setError(errorMessage(e)));
  }

  useEffect(load, []);

  function patchRow(updated: UserRow) {
    setUsers((prev) =>
      prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : prev
    );
  }

  async function changeRole(user: UserRow, role: Role) {
    if (role === user.role) return;
    setBusyId(user.id);
    try {
      const updated = await api.patch<UserRow>(`/api/users/${user.id}`, { role });
      patchRow(updated);
      toast.success(`${user.email} is now ${ROLE_LABEL[role]}.`);
    } catch (e) {
      toast.error(errorMessage(e));
      load(); // resync the select after a rejected change
    } finally {
      setBusyId(null);
    }
  }

  async function toggleStatus(user: UserRow) {
    const next = user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    setBusyId(user.id);
    try {
      const updated = await api.patch<UserRow>(`/api/users/${user.id}`, { status: next });
      patchRow(updated);
      toast.success(
        next === "SUSPENDED" ? `${user.email} suspended.` : `${user.email} reactivated.`
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function resend(user: UserRow) {
    setBusyId(user.id);
    try {
      const res = await api.post<InviteResult>(`/api/users/${user.id}/resend-invite`);
      patchRow(res.user);
      if (res.delivered) {
        toast.success(`Invite re-sent to ${user.email}.`);
      } else {
        setResentLink({ email: user.email, url: res.acceptUrl });
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Invite teammates and manage roles and access."
        actions={
          <Button variant="primary" onClick={() => setInviteOpen(true)}>
            Invite user
          </Button>
        }
      />
      <PageBody>
        {error ? (
          <InlineError message={error} />
        ) : users === null ? (
          <Loading label="Loading users…" />
        ) : users.length === 0 ? (
          <EmptyState
            title="No users yet"
            description="Invite your first teammate to get started."
            action={
              <Button variant="primary" onClick={() => setInviteOpen(true)}>
                Invite user
              </Button>
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-mute">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last login</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u.id === currentUserId;
                    const busy = busyId === u.id;
                    return (
                      <tr
                        key={u.id}
                        className="border-b border-line last:border-0 hover:bg-paper-sunken/40"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">
                            {u.name ?? u.email}
                            {isSelf ? (
                              <span className="ml-1.5 text-xs text-ink-faint">(you)</span>
                            ) : null}
                          </div>
                          {u.name ? (
                            <div className="text-xs text-ink-mute">{u.email}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            aria-label={`Role for ${u.email}`}
                            value={u.role}
                            disabled={busy}
                            onChange={(e) => changeRole(u, e.target.value as Role)}
                            className="h-8 w-36 text-[13px]"
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={statusTone(u.status)}>
                            {STATUS_LABEL[u.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-ink-mute">
                          {u.lastLoginAt ? relativeTime(u.lastLoginAt) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {u.status === "INVITED" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => resend(u)}
                              >
                                Resend invite
                              </Button>
                            ) : (
                              <Button
                                variant={u.status === "SUSPENDED" ? "secondary" : "danger"}
                                size="sm"
                                disabled={busy || isSelf}
                                title={isSelf ? "You can't change your own status." : undefined}
                                onClick={() => toggleStatus(u)}
                              >
                                {u.status === "SUSPENDED" ? "Activate" : "Suspend"}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </PageBody>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(res) => {
          setUsers((prev) => (prev ? [res.user, ...prev] : [res.user]));
        }}
      />

      {/* Surface the regenerated link when a resend couldn't be emailed. */}
      <Modal
        open={resentLink !== null}
        onClose={() => setResentLink(null)}
        title="Invite link"
        footer={
          <Button variant="primary" onClick={() => setResentLink(null)}>
            Done
          </Button>
        }
      >
        {resentLink ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">
              Email isn&apos;t configured. Share this link with {resentLink.email}:
            </p>
            <CopyLink url={resentLink.url} />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
