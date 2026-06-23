"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/ui/cn";
import { contentTypeLabel, CONTENT_TYPES } from "@/lib/ui/format";
import type { ContentType, Role } from "@/lib/ui/types";
import { NavGroup, type NavSubItem } from "./NavGroup";

interface NavUser {
  name: string | null;
  email: string;
  role: Role;
}

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  EDITOR: "Editor",
  AUTHOR: "Author",
  CONTRIBUTOR: "Contributor",
  VIEWER: "Viewer",
};

/** Settings sub-items + their UX role gates (API still enforces real authz). */
const SETTINGS_ITEMS: { href: string; label: string; roles: Role[] }[] = [
  { href: "/settings", label: "General", roles: ["ADMIN"] },
  { href: "/users", label: "Users", roles: ["ADMIN"] },
  { href: "/sops", label: "Writing SOPs", roles: ["ADMIN", "EDITOR"] },
  { href: "/knowledge-base", label: "Knowledge Base", roles: ["ADMIN", "EDITOR"] },
  { href: "/audit", label: "Audit log", roles: ["ADMIN", "EDITOR"] },
];

/** Icon per content type for the collapsible groups. */
function contentTypeIcon(type: ContentType): React.ReactNode {
  switch (type) {
    case "BLOG":
      return <IconDoc />;
    case "WEBINAR":
      return <IconVideo />;
    case "NEWS":
      return <IconNews />;
    case "RESOURCE":
      return <IconBook />;
    case "FAQ":
      return <IconHelp />;
    default:
      return <IconDoc />;
  }
}

/**
 * Public shell. Wraps the inner implementation in Suspense because it reads
 * useSearchParams() (required by Next 15 when rendered under a server layout).
 */
export function AppShell(props: {
  user: NavUser;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AppShellInner {...props} />
    </Suspense>
  );
}

function AppShellInner({
  user,
  signOutAction,
  children,
}: {
  user: NavUser;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  const activeType = searchParams.get("type");
  const activeStatus = searchParams.get("status");
  const isReadOnly = user.role === "VIEWER";
  const onContent = pathname === "/content" || pathname === "/content/new";

  // Build the four sub-links for a content-type group, marking the exact one
  // that matches pathname + ?type + ?status.
  const contentSubItems = (type: ContentType): NavSubItem[] => {
    const items: NavSubItem[] = [];

    if (!isReadOnly) {
      items.push({
        href: `/content/new?type=${type}`,
        label: "Create New",
        active: pathname === "/content/new" && activeType === type,
      });
    }

    const listLink = (status: "DRAFT" | "PUBLISHED" | "SCHEDULED", label: string): NavSubItem => ({
      href: `/content?type=${type}&status=${status}`,
      label,
      active:
        pathname === "/content" &&
        activeType === type &&
        activeStatus === status,
    });

    items.push(listLink("DRAFT", "Drafts"));
    items.push(listLink("PUBLISHED", "Published"));
    items.push(listLink("SCHEDULED", "Scheduled"));

    return items;
  };

  // Whether a content group should auto-expand: any of its children is active.
  const contentGroupOpen = (type: ContentType): boolean =>
    (pathname === "/content" && activeType === type) ||
    (pathname === "/content/new" && activeType === type);

  const settingsSubItems: NavSubItem[] = SETTINGS_ITEMS.filter((i) =>
    i.roles.includes(user.role)
  ).map((i) => ({
    href: i.href,
    label: i.label,
    active: pathname === i.href || pathname.startsWith(`${i.href}/`),
  }));

  const showSettings =
    (user.role === "ADMIN" || user.role === "EDITOR") &&
    settingsSubItems.length > 0;
  const settingsOpen = settingsSubItems.some((i) => i.active);

  const dashboardActive = pathname === "/";

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-paper-raised transition-transform md:static md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-line px-5">
          <span className="grid h-7 w-7 place-items-center rounded bg-accent text-sm font-bold text-white">
            C
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            Clovion
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {/* Dashboard */}
          <Link
            href="/"
            onClick={closeMobile}
            aria-current={dashboardActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
              dashboardActive
                ? "bg-accent-soft text-accent-ink"
                : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
            )}
          >
            <span className="text-current opacity-80">
              <IconHome />
            </span>
            Dashboard
          </Link>

          {/* CONTENT — single collapsible parent holding the five type groups */}
          <NavGroup
            label="Content"
            icon={<IconLayers />}
            defaultOpen={onContent}
            containsActive={onContent}
            onNavigate={closeMobile}
          >
            {CONTENT_TYPES.map((type) => (
              <NavGroup
                key={type}
                label={contentTypeLabel(type)}
                icon={contentTypeIcon(type)}
                items={contentSubItems(type)}
                defaultOpen={contentGroupOpen(type)}
                onNavigate={closeMobile}
              />
            ))}
          </NavGroup>

          {/* WORKSPACE */}
          <SectionLabel>Workspace</SectionLabel>
          <Link
            href="/media"
            onClick={closeMobile}
            aria-current={
              pathname === "/media" || pathname.startsWith("/media/")
                ? "page"
                : undefined
            }
            className={cn(
              "flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
              pathname === "/media" || pathname.startsWith("/media/")
                ? "bg-accent-soft text-accent-ink"
                : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
            )}
          >
            <span className="text-current opacity-80">
              <IconImage />
            </span>
            Media Library
          </Link>

          {showSettings ? (
            <NavGroup
              label="Settings"
              icon={<IconGear />}
              items={settingsSubItems}
              defaultOpen={settingsOpen}
              onNavigate={closeMobile}
            />
          ) : null}
        </nav>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 rounded-sm px-2 py-1.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper-sunken text-xs font-semibold text-ink-soft">
              {(user.name ?? user.email).slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {user.name ?? user.email}
              </p>
              <p className="truncate text-xs text-ink-mute">
                {ROLE_LABEL[user.role]}
              </p>
            </div>
          </div>
          <Link
            href="/profile"
            onClick={closeMobile}
            className="mt-1.5 flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            <IconUser />
            My profile
          </Link>
          <form action={signOutAction} className="mt-0.5">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
            >
              <IconLogout />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-ink/30 md:hidden"
          onClick={closeMobile}
        />
      ) : null}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-line bg-paper-raised/80 px-4 backdrop-blur md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded p-1.5 text-ink-soft hover:bg-paper-sunken"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <span className="font-display text-base font-semibold">Clovion CMS</span>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

/* ── Section label ──────────────────────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
      {children}
    </p>
  );
}

/* ── Inline icons (stroke-based, 18px) ──────────────────────────────────── */
function Svg(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}
function IconHome() {
  return <Svg><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></Svg>;
}
function IconLayers() {
  return <Svg><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></Svg>;
}
function IconDoc() {
  return <Svg><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /><path d="M9 13h6M9 17h6" /></Svg>;
}
function IconVideo() {
  return <Svg><rect x="2" y="5" width="14" height="14" rx="2" /><path d="m16 9 6-3v12l-6-3z" /></Svg>;
}
function IconNews() {
  return <Svg><path d="M4 4h13v16H6a2 2 0 0 1-2-2z" /><path d="M17 8h3v10a2 2 0 0 1-2 2" /><path d="M8 8h5M8 12h5M8 16h5" /></Svg>;
}
function IconHelp() {
  return <Svg><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7" /><path d="M12 17h.01" /></Svg>;
}
function IconImage() {
  return <Svg><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5L5 20" /></Svg>;
}
function IconBook() {
  return <Svg><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 3z" /><path d="M18 7v13" /></Svg>;
}
function IconGear() {
  return <Svg><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1l2.1-2.1M17 7l2.1-2.1" /></Svg>;
}
function IconUser() {
  return <Svg><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></Svg>;
}
function IconLogout() {
  return <Svg><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></Svg>;
}
