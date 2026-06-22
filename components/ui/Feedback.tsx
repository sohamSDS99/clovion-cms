"use client";

import { cn } from "@/lib/ui/cn";

/** Centered loading affordance. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-5 w-5 animate-spin text-ink-mute", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Loading"
      role="status"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-mute">
      <Spinner /> {label}
    </div>
  );
}

/** Empty / zero-state with optional action. */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded border border-dashed border-line-strong bg-paper-raised/50 px-6 py-14 text-center">
      {icon ? <div className="text-ink-faint">{icon}</div> : null}
      <div>
        <p className="font-display text-base font-semibold text-ink">{title}</p>
        {description ? (
          <p className="mt-1 max-w-sm text-sm text-ink-mute">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** Inline error panel for failed loads/mutations. */
export function InlineError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
    >
      {message}
    </div>
  );
}
