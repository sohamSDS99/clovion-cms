"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/ui/cn";
import {
  contentTypePlural,
  CONTENT_TYPE_ORDER,
} from "@/lib/ui/format";
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

/** Public marketing site this CMS feeds. */
const PUBLIC_SITE = "https://www.clovion.ai";

/** Icon per content type for the collapsible groups. */
function contentTypeIcon(type: ContentType): React.ReactNode {
  switch (type) {
    case "BLOG":
      return <IconDoc />;
    case "RESEARCH":
      return <IconFlask />;
    case "WEBINAR":
      return <IconVideo />;
    case "NEWS":
      return <IconNews />;
    case "RESOURCE":
      return <IconResource />;
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

  // Build the sub-links for a content-type group, marking the exact one that
  // matches pathname + ?type + ?status.
  const contentSubItems = (type: ContentType): NavSubItem[] => {
    const items: NavSubItem[] = [];

    if (!isReadOnly) {
      items.push({
        href: `/content/new?type=${type}`,
        label: "Create New",
        icon: <IconPlus />,
        active: pathname === "/content/new" && activeType === type,
      });
    }

    const listLink = (
      status: "DRAFT" | "PUBLISHED" | "SCHEDULED",
      label: string,
      icon: React.ReactNode
    ): NavSubItem => ({
      href: `/content?type=${type}&status=${status}`,
      label,
      icon,
      active:
        pathname === "/content" &&
        activeType === type &&
        activeStatus === status,
    });

    items.push(listLink("DRAFT", "Drafts", <IconPencil />));
    items.push(listLink("PUBLISHED", "Published", <IconCheckCircle />));
    items.push(listLink("SCHEDULED", "Scheduled", <IconCalendar />));

    return items;
  };

  // Whether a content group should auto-expand: any of its children is active.
  const contentGroupOpen = (type: ContentType): boolean =>
    (pathname === "/content" && activeType === type) ||
    (pathname === "/content/new" && activeType === type);

  const settingsActive =
    pathname === "/settings" || pathname.startsWith("/settings/");

  const showKnowledgeBase = user.role === "ADMIN" || user.role === "EDITOR";
  const kbActive =
    pathname === "/knowledge-base" || pathname.startsWith("/knowledge-base/");
  const mediaActive = pathname === "/media" || pathname.startsWith("/media/");
  const dashboardActive = pathname === "/";

  return (
    <div className="flex h-screen overflow-hidden bg-paper text-ink">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-line bg-paper-sidebar transition-transform md:static md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/favicon.png"
              alt=""
              aria-hidden="true"
              className="h-4.5 w-4.5 invert"
              style={{ height: "1.1rem", width: "1.1rem" }}
            />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-base font-semibold tracking-tight text-ink">
              Clovion
            </span>
            <span className="truncate text-[11px] text-ink-mute">
              Content Studio
            </span>
          </span>
        </div>

        {/* Scrollable nav — ONLY this region scrolls; brand + footer stay put */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {/* Dashboard */}
          <Link
            href="/"
            onClick={closeMobile}
            aria-current={dashboardActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              dashboardActive
                ? "bg-paper-sunken text-ink"
                : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
            )}
          >
            <span className="text-current opacity-70">
              <IconGrid />
            </span>
            Dashboard
          </Link>

          {/* CONTENT — one collapsible group per content type */}
          <SectionLabel>Content</SectionLabel>
          {CONTENT_TYPE_ORDER.map((type) => (
            <NavGroup
              key={type}
              label={contentTypePlural(type)}
              icon={contentTypeIcon(type)}
              items={contentSubItems(type)}
              defaultOpen={contentGroupOpen(type)}
              onNavigate={closeMobile}
            />
          ))}

          {/* WORKSPACE */}
          <SectionLabel>Workspace</SectionLabel>

          {showKnowledgeBase ? (
            <NavLink
              href="/knowledge-base"
              active={kbActive}
              icon={<IconBook />}
              onNavigate={closeMobile}
            >
              Knowledge Base
            </NavLink>
          ) : null}

          <NavLink
            href="/media"
            active={mediaActive}
            icon={<IconImage />}
            onNavigate={closeMobile}
          >
            Media Library
          </NavLink>

          <NavLink
            href="/settings"
            active={settingsActive}
            icon={<IconGear />}
            onNavigate={closeMobile}
          >
            Settings
          </NavLink>
        </nav>

        {/* Footer — pinned (does not scroll) */}
        <div className="shrink-0 border-t border-line p-3">
          <a
            href={PUBLIC_SITE}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            <span className="opacity-70">
              <IconGlobe />
            </span>
            View site
          </a>

          <div className="mt-1 flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">
              {(user.name ?? user.email).slice(0, 1).toUpperCase()}
            </span>
            <Link
              href="/settings?tab=profile"
              onClick={closeMobile}
              className="min-w-0 flex-1"
            >
              <p className="truncate text-sm font-medium text-ink">
                {user.name ?? user.email}
              </p>
              <p className="truncate text-xs text-ink-mute">
                {user.name ? user.email : ROLE_LABEL[user.role]}
              </p>
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="rounded-md p-1.5 text-ink-mute transition-colors hover:bg-paper-sunken hover:text-ink"
              >
                <IconLogout />
              </button>
            </form>
          </div>
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
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-paper-raised/80 px-4 backdrop-blur md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded p-1.5 text-ink-soft hover:bg-paper-sunken"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <span className="text-base font-semibold">Clovion CMS</span>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

/* ── Flat nav link (Workspace items) ────────────────────────────────────── */
function NavLink({
  href,
  active,
  icon,
  onNavigate,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-paper-sunken text-ink"
          : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
      )}
    >
      <span className="text-current opacity-70">{icon}</span>
      {children}
    </Link>
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
function SvgSm(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="15"
      height="15"
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
function IconGrid() {
  return <Svg><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Svg>;
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
function IconResource() {
  return <Svg><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /><path d="M12 3v11" /><path d="m8 10 4 4 4-4" /></Svg>;
}
function IconImage() {
  return <Svg><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5L5 20" /></Svg>;
}
function IconBook() {
  return <Svg><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 3z" /><path d="M18 7v13" /></Svg>;
}
function IconFlask() {
  return <Svg><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" /><path d="M7.5 15h9" /></Svg>;
}
function IconGear() {
  return <Svg><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1l2.1-2.1M17 7l2.1-2.1" /></Svg>;
}
function IconGlobe() {
  return <Svg><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" /></Svg>;
}
function IconLogout() {
  return <Svg><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></Svg>;
}
function IconPlus() {
  return <SvgSm><path d="M12 5v14M5 12h14" /></SvgSm>;
}
function IconPencil() {
  return <SvgSm><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></SvgSm>;
}
function IconCheckCircle() {
  return <SvgSm><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></SvgSm>;
}
function IconCalendar() {
  return <SvgSm><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></SvgSm>;
}
