"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui/cn";
import type { Role } from "@/lib/ui/types";

interface NavUser {
  name: string | null;
  email: string;
  role: Role;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Roles allowed to see this nav item (UX only; API enforces real authz). */
  roles?: Role[];
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: <IconHome /> },
  { href: "/content", label: "Content", icon: <IconDoc /> },
  { href: "/media", label: "Media", icon: <IconImage /> },
  {
    href: "/sops",
    label: "Writing SOPs",
    icon: <IconBook />,
    roles: ["ADMIN", "EDITOR"],
  },
  {
    href: "/knowledge-base",
    label: "Knowledge Base",
    icon: <IconBook />,
    roles: ["ADMIN", "EDITOR"],
  },
  {
    href: "/lead-forms",
    label: "Lead Forms",
    icon: <IconForm />,
    roles: ["ADMIN", "EDITOR"],
  },
  {
    href: "/settings",
    label: "Settings",
    icon: <IconGear />,
    roles: ["ADMIN"],
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: <IconChart />,
    roles: ["ADMIN", "EDITOR"],
  },
  {
    href: "/audit",
    label: "Audit log",
    icon: <IconList />,
    roles: ["ADMIN", "EDITOR"],
  },
  {
    href: "/users",
    label: "Users",
    icon: <IconUsers />,
    roles: ["ADMIN"],
  },
];

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  EDITOR: "Editor",
  AUTHOR: "Author",
  CONTRIBUTOR: "Contributor",
  VIEWER: "Viewer",
};

export function AppShell({
  user,
  signOutAction,
  children,
}: {
  user: NavUser;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleNav = NAV.filter(
    (item) => !item.roles || item.roles.includes(user.role)
  );

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

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

        <nav className="flex-1 space-y-0.5 p-3">
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-accent-soft text-accent-ink"
                  : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
              )}
            >
              <span className="text-current opacity-80">{item.icon}</span>
              {item.label}
            </Link>
          ))}
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
            onClick={() => setMobileOpen(false)}
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
          onClick={() => setMobileOpen(false)}
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
function IconDoc() {
  return <Svg><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /><path d="M9 13h6M9 17h6" /></Svg>;
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
function IconChart() {
  return <Svg><path d="M3 3v18h18" /><path d="M7 15v3M12 10v8M17 6v12" /></Svg>;
}
function IconList() {
  return <Svg><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Svg>;
}
function IconForm() {
  return <Svg><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></Svg>;
}
function IconUsers() {
  return <Svg><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Svg>;
}
function IconUser() {
  return <Svg><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></Svg>;
}
function IconLogout() {
  return <Svg><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></Svg>;
}
