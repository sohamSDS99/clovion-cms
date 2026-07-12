"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageBody } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Loading, InlineError, EmptyState } from "@/components/ui/Feedback";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { InviteDialog } from "@/components/users/InviteDialog";
import { AuthorProfileCreateModal } from "./AuthorProfileCreateModal";
import { api, errorMessage } from "@/lib/ui/client";
import { AuthorProfileEditModal } from "./AuthorProfileEditModal";
import type { AuthorProfileAdminRow } from "./types";

interface ListResponse {
  profiles: AuthorProfileAdminRow[];
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function linkedinOf(row: AuthorProfileAdminRow): string | null {
  return row.socialLinks?.linkedin ?? null;
}

function initialsOf(name: string): string {
  const p = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return p || "?";
}

/**
 * Admin → Author Profiles oversight screen (FR-USER-02). Lists every author
 * profile with live client-side search. "Add Author Profile" reuses the invite
 * flow (a non-viewer invite auto-creates a paired profile); per-row Edit opens
 * the admin editor. The listing API is capability-gated server-side.
 */
export function AuthorProfilesManager() {
  const [rows, setRows] = useState<AuthorProfileAdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AuthorProfileAdminRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AuthorProfileAdminRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Rows whose avatar image 404'd — fall back to initials instead of a broken glyph.
  const [brokenAvatars, setBrokenAvatars] = useState<Set<string>>(new Set());
  const toast = useToast();

  async function remove(row: AuthorProfileAdminRow) {
    setBusyId(row.id);
    try {
      await api.delete(`/api/author-profiles/${row.id}`);
      setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev));
      toast.success(`Deleted "${row.displayName}".`);
      setConfirmDelete(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  function load() {
    setRows(null);
    setError(null);
    api
      .get<ListResponse>("/api/author-profiles", { view: "admin" })
      .then((r) => setRows(r.profiles))
      .catch((e) => setError(errorMessage(e)));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.displayName,
        r.title ?? "",
        linkedinOf(r) ?? "",
        r.createdByEmail ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  function patchRow(updated: AuthorProfileAdminRow) {
    setRows((prev) =>
      prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev
    );
  }

  const total = rows?.length ?? 0;
  const shown = filtered.length;

  return (
    <>
      <PageHeader
        title="Author Profiles"
        description="Every author byline across the studio (FR-USER-02)."
      />
      <PageBody>
        {error ? (
          <InlineError message={error} />
        ) : rows === null ? (
          <Loading label="Loading author profiles…" />
        ) : (
          <Card className="overflow-hidden">
              {/* Header: count + search + add */}
              <div className="flex flex-col gap-3 border-b border-line px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                  <h3 className="whitespace-nowrap text-lg font-semibold text-ink">
                    Author Profiles{" "}
                    <span className="text-ink-mute">
                      ({shown} out of {total})
                    </span>
                  </h3>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search author profiles"
                    aria-label="Search author profiles"
                    className="h-9 w-full rounded-sm border border-line-strong bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 sm:max-w-xs"
                  />
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="primary" onClick={() => setCreateOpen(true)}>
                    <IconUserPlus /> Create profile
                  </Button>
                  <Button variant="secondary" onClick={() => setInviteOpen(true)}>
                    Invite author
                  </Button>
                </div>
              </div>

              {total === 0 ? (
                <div className="px-6 py-10">
                  <EmptyState
                    title="No author profiles yet"
                    description="Create a byline-only profile directly, or invite a teammate to set up their own."
                    action={
                      <div className="flex justify-center gap-2">
                        <Button variant="primary" onClick={() => setCreateOpen(true)}>
                          Create profile
                        </Button>
                        <Button variant="secondary" onClick={() => setInviteOpen(true)}>
                          Invite author
                        </Button>
                      </div>
                    }
                  />
                </div>
              ) : shown === 0 ? (
                <div className="px-6 py-10">
                  <EmptyState
                    title="No matches"
                    description="No author profiles match your search."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs font-semibold uppercase tracking-wide text-ink-mute">
                        <th className="px-6 py-3">Full name</th>
                        <th className="px-6 py-3">LinkedIn URL</th>
                        <th className="px-6 py-3">Job title</th>
                        <th className="px-6 py-3">Created by</th>
                        <th className="px-6 py-3">Created at</th>
                        <th className="px-6 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {filtered.map((r) => {
                        const linkedin = linkedinOf(r);
                        return (
                          <tr key={r.id} className="align-middle">
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-paper-sunken text-[11px] font-semibold text-ink-mute">
                                  {r.avatarUrl && !brokenAvatars.has(r.id) ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={r.avatarUrl}
                                      alt=""
                                      className="h-full w-full object-cover"
                                      onError={() =>
                                        setBrokenAvatars((s) => new Set(s).add(r.id))
                                      }
                                    />
                                  ) : (
                                    initialsOf(r.displayName)
                                  )}
                                </span>
                                <span className="truncate font-medium text-ink">
                                  {r.displayName}
                                </span>
                                {!r.isPublic ? (
                                  <Badge tone="draft">Private</Badge>
                                ) : null}
                              </div>
                            </td>
                            <td className="max-w-[16rem] px-6 py-3.5">
                              {linkedin ? (
                                <a
                                  href={linkedin}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block truncate text-accent hover:underline"
                                  title={linkedin}
                                >
                                  {linkedin}
                                </a>
                              ) : (
                                <span className="text-ink-faint">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-ink-soft">
                              {r.title?.trim() ? (
                                r.title
                              ) : (
                                <span className="text-ink-faint">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-ink-soft">
                              {r.createdByEmail ?? (
                                <span className="text-ink-faint">—</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-3.5 text-ink-mute">
                              {fmtDate(r.createdAt)}
                            </td>
                            <td className="px-6 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setEditing(r)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setConfirmDelete(r)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </Card>
        )}
      </PageBody>

      {/* Invite → auto-creates a paired author profile for non-viewers. */}
      <AuthorProfileCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => load()}
      />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete author profile"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={confirmDelete ? busyId === confirmDelete.id : false}
              onClick={() => confirmDelete && remove(confirmDelete)}
            >
              Delete profile
            </Button>
          </>
        }
      >
        {confirmDelete ? (
          <p className="text-sm text-ink-soft">
            Permanently delete{" "}
            <span className="font-medium text-ink">{confirmDelete.displayName}</span>? This
            can&apos;t be undone. A profile used as the author on existing content can&apos;t be
            deleted until those items are reassigned.
          </p>
        ) : null}
      </Modal>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => load()}
      />

      <AuthorProfileEditModal
        profile={editing}
        onClose={() => setEditing(null)}
        onSaved={patchRow}
      />
    </>
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
