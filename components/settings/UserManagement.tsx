"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Loading, InlineError, EmptyState } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { InviteDialog } from "@/components/users/InviteDialog";
import { CopyLink } from "@/components/users/CopyLink";
import { api, errorMessage } from "@/lib/ui/client";
import {
  ROLE_LABEL,
  ROLE_OPTIONS,
  STATUS_LABEL,
  statusTone,
  type InviteResult,
  type UserRow,
} from "@/components/users/types";
import type { Role } from "@/lib/ui/types";

interface ListResponse {
  items: UserRow[];
}

/** Role summary cards shown under the user list (matches the marketing IA). */
const ROLE_CARDS: { role: Role; blurb: string }[] = [
  { role: "ADMIN", blurb: "Full access — content, media, users and settings" },
  {
    role: "EDITOR",
    blurb:
      "Create, edit, publish, schedule and delete content; manage media and knowledge",
  },
  {
    role: "AUTHOR",
    blurb: "Create and edit content — cannot publish, schedule, duplicate or delete",
  },
  { role: "VIEWER", blurb: "Read-only access to the studio" },
];

/** Avatar background palette, picked deterministically from the display string. */
const AVATAR_BG = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
];
function avatarClass(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length];
}

function joinedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Settings → User Management tab (FR-USER-01). Lists members with role/status
 * dropdowns + delete, an "Add user" invite flow, and role summary cards. The
 * API is authoritative; this gates UX to Admins.
 */
export function UserManagement({ currentUserId }: { currentUserId: string }) {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<UserRow | null>(null);
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
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(user: UserRow, status: "ACTIVE" | "SUSPENDED") {
    if (status === user.status) return;
    setBusyId(user.id);
    try {
      const updated = await api.patch<UserRow>(`/api/users/${user.id}`, { status });
      patchRow(updated);
      toast.success(
        status === "SUSPENDED" ? `${user.email} suspended.` : `${user.email} reactivated.`
      );
    } catch (e) {
      toast.error(errorMessage(e));
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(user: UserRow) {
    setBusyId(user.id);
    try {
      await api.delete(`/api/users/${user.id}`);
      setUsers((prev) => (prev ? prev.filter((u) => u.id !== user.id) : prev));
      toast.success(`${user.email} removed.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
      setConfirmUser(null);
    }
  }

  async function resend(user: UserRow) {
    setBusyId(user.id);
    try {
      const res = await api.post<InviteResult>(`/api/users/${user.id}/resend-invite`);
      patchRow(res.user);
      if (res.delivered) toast.success(`Invite re-sent to ${user.email}.`);
      else setResentLink({ email: user.email, url: res.acceptUrl });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <InlineError message={error} />;
  if (users === null) return <Loading label="Loading users…" />;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
          <div>
            <h3 className="text-lg font-semibold text-ink">Users</h3>
            <p className="mt-0.5 text-sm text-ink-mute">
              {users.length} {users.length === 1 ? "member" : "members"} — manage
              roles and access.
            </p>
          </div>
          <Button variant="primary" onClick={() => setInviteOpen(true)}>
            <IconUserPlus /> Add user
          </Button>
        </div>

        {users.length === 0 ? (
          <div className="px-6 py-10">
            <EmptyState
              title="No users yet"
              description="Invite your first teammate to get started."
              action={
                <Button variant="primary" onClick={() => setInviteOpen(true)}>
                  Add user
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const busy = busyId === u.id;
              const name = u.name ?? u.email;
              return (
                <li
                  key={u.id}
                  className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center"
                >
                  {/* Identity */}
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${avatarClass(name)}`}
                    >
                      {name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-ink">
                          {name}
                        </span>
                        {u.status === "ACTIVE" ? (
                          <span className="text-accent" title="Active member">
                            <IconShieldCheck />
                          </span>
                        ) : null}
                        <Badge tone={statusTone(u.status)}>
                          {STATUS_LABEL[u.status]}
                        </Badge>
                        {isSelf ? (
                          <span className="text-xs text-ink-faint">(you)</span>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-ink-mute">
                        {u.email} · joined {joinedDate(u.createdAt)}
                      </p>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2">
                    <Select
                      aria-label={`Role for ${u.email}`}
                      value={u.role}
                      disabled={busy}
                      onChange={(e) => changeRole(u, e.target.value as Role)}
                      className="h-9 w-32 text-[13px]"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>

                    {u.status === "INVITED" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => resend(u)}
                      >
                        Resend
                      </Button>
                    ) : (
                      <Select
                        aria-label={`Status for ${u.email}`}
                        value={u.status}
                        disabled={busy || isSelf}
                        onChange={(e) =>
                          changeStatus(u, e.target.value as "ACTIVE" | "SUSPENDED")
                        }
                        className="h-9 w-32 text-[13px]"
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="SUSPENDED">Suspended</option>
                      </Select>
                    )}

                    <button
                      type="button"
                      aria-label={`Remove ${u.email}`}
                      title={isSelf ? "You can't remove yourself." : "Remove user"}
                      disabled={busy || isSelf}
                      onClick={() => setConfirmUser(u)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-mute transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-mute"
                    >
                      <IconTrash />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Role legend */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ROLE_CARDS.map(({ role, blurb }) => (
          <div
            key={role}
            className="rounded-xl border border-line bg-paper-raised p-4 shadow-card"
          >
            <div className="flex items-center gap-1.5">
              {role === "ADMIN" ? (
                <span className="text-accent">
                  <IconShieldCheck />
                </span>
              ) : null}
              <p className="font-semibold text-ink">{ROLE_LABEL[role]}</p>
            </div>
            <p className="mt-1 text-sm text-ink-mute">{blurb}</p>
          </div>
        ))}
      </div>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(res) =>
          setUsers((prev) => (prev ? [res.user, ...prev] : [res.user]))
        }
      />

      {/* Delete confirmation */}
      <Modal
        open={confirmUser !== null}
        onClose={() => setConfirmUser(null)}
        title="Remove user"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmUser(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={confirmUser ? busyId === confirmUser.id : false}
              onClick={() => confirmUser && remove(confirmUser)}
            >
              Remove user
            </Button>
          </div>
        }
      >
        {confirmUser ? (
          <p className="text-sm text-ink-soft">
            Permanently remove <span className="font-medium">{confirmUser.email}</span>?
            They lose access immediately. Content they authored keeps its byline.
          </p>
        ) : null}
      </Modal>

      {/* Regenerated invite link when email isn't configured */}
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
    </div>
  );
}

/* ── Icons ──────────────────────────────────────────────────────────────── */
function IconUserPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="4" />
      <path d="M3 21v-1a6 6 0 0 1 6-6h2" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  );
}
function IconShieldCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  );
}
