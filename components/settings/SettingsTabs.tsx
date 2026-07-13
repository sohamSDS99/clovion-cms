"use client";

import { useState } from "react";
import { PageHeader, PageBody } from "@/components/shell/PageHeader";
import { cn } from "@/lib/ui/cn";
import type { Role } from "@/lib/ui/types";
import { ProfileSettings } from "./ProfileSettings";
import { WritingStyle } from "./WritingStyle";
import { UserManagement } from "./UserManagement";
import { AiSettings } from "./AiSettings";

export type SettingsTab = "profile" | "writing" | "ai" | "users";

interface SettingsUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

const TABS: {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
  roles: Role[] | null; // null = everyone
}[] = [
  { id: "profile", label: "Profile Settings", icon: <IconUser />, roles: null },
  {
    id: "writing",
    label: "Writing Style",
    icon: <IconWand />,
    roles: ["ADMIN", "EDITOR"],
  },
  {
    id: "ai",
    label: "AI Provider",
    icon: <IconWand />,
    roles: ["ADMIN"],
  },
  {
    id: "users",
    label: "User Management",
    icon: <IconUsers />,
    roles: ["ADMIN"],
  },
];

/**
 * Settings — a single page with three role-gated tabs:
 *   • Profile Settings — the acting user's author byline (everyone).
 *   • Writing Style — the master AI prompt (ADMIN/EDITOR).
 *   • User Management — team roles + access (ADMIN).
 * API routes remain authoritative; tab visibility is UX only.
 */
export function SettingsTabs({
  user,
  initialTab,
}: {
  user: SettingsUser;
  initialTab: SettingsTab;
}) {
  const visible = TABS.filter((t) => !t.roles || t.roles.includes(user.role));
  const allowed = visible.some((t) => t.id === initialTab)
    ? initialTab
    : visible[0]?.id ?? "profile";
  const [tab, setTab] = useState<SettingsTab>(allowed);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your profile and your team's access."
      />
      <PageBody className="space-y-6">
        {/* Pill tab strip */}
        <div
          role="tablist"
          aria-label="Settings sections"
          className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-paper-sunken p-1"
        >
          {visible.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-paper-raised text-ink shadow-card"
                    : "text-ink-mute hover:text-ink"
                )}
              >
                <span className={active ? "text-ink-soft" : "text-ink-faint"}>
                  {t.icon}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Active tab */}
        {tab === "profile" ? (
          <ProfileSettings email={user.email} />
        ) : tab === "writing" ? (
          <WritingStyle canEdit={user.role === "ADMIN" || user.role === "EDITOR"} />
        ) : tab === "ai" ? (
          <AiSettings />
        ) : (
          <UserManagement currentUserId={user.id} />
        )}
      </PageBody>
    </>
  );
}

/* ── Icons ──────────────────────────────────────────────────────────────── */
function IconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  );
}
function IconWand() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z" />
      <path d="M5 13 13 5l1.5 1.5L6.5 14.5 5 13Z" />
      <path d="m6.5 14.5-2.5 5 5-2.5" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 6.5M18 20v-1a5 5 0 0 0-3-4.6" />
    </svg>
  );
}
