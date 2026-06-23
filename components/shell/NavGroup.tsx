"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/ui/cn";

export interface NavSubItem {
  href: string;
  label: string;
  /** True when this sub-item matches the current route exactly. */
  active: boolean;
}

/**
 * A collapsible sidebar group: a header row with an icon, label and a chevron
 * that rotates on expand, plus indented sub-links. Seeded open when any child
 * is active (controlled by the parent via `defaultOpen`).
 */
export function NavGroup({
  label,
  icon,
  items,
  children,
  defaultOpen,
  onNavigate,
  containsActive,
}: {
  label: string;
  icon: React.ReactNode;
  /** Leaf sub-links. Omit when nesting groups via `children`. */
  items?: NavSubItem[];
  /** Nested content (e.g. child NavGroups) rendered in the expandable body. */
  children?: React.ReactNode;
  defaultOpen: boolean;
  onNavigate: () => void;
  /** Active hint when using `children` (parent can't infer from `items`). */
  containsActive?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasActiveChild = containsActive ?? (items?.some((i) => i.active) ?? false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
          hasActiveChild && !open
            ? "text-accent-ink"
            : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
        )}
      >
        <span className="text-current opacity-80">{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <IconChevron
          className={cn(
            "shrink-0 text-ink-mute transition-transform duration-150",
            open && "rotate-90"
          )}
        />
      </button>

      {open ? (
        <div className="mt-0.5 space-y-0.5 pl-4">
          {children ??
            items?.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-sm py-1.5 pl-4 pr-3 text-sm transition-colors",
                  "border-l border-line",
                  item.active
                    ? "border-accent bg-accent-soft font-medium text-accent-ink"
                    : "text-ink-soft hover:bg-paper-sunken hover:text-ink"
                )}
              >
                {item.label}
              </Link>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function IconChevron({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
