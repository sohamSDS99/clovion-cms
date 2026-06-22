"use client";

import { useId, useRef } from "react";
import { cn } from "@/lib/ui/cn";
import { useFocusTrap } from "./useFocusTrap";

/**
 * Accessible modal dialog (NFR-A11Y-01, WCAG 2.1 AA). Closes on Escape / backdrop
 * click, traps Tab focus within the dialog, focuses the first control on open,
 * restores focus to the opener on close, locks background scroll, and labels
 * itself via aria-labelledby (the visible title) for screen readers.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Focus trap + scroll lock + Escape + focus restore.
  useFocusTrap(panelRef, open, onClose);

  if (!open) return null;

  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 pt-[8vh] clv-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "w-full rounded border border-line bg-paper-raised shadow-pop clv-pop-in outline-none",
          widths[size]
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-ink-mute hover:bg-paper-sunken hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Right-side slide-over drawer (used for media detail / revisions). */
export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Same focus-trap / scroll-lock / Escape / focus-restore lifecycle as Modal.
  useFocusTrap(panelRef, open, onClose);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/30 clv-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "flex h-full w-full flex-col bg-paper-raised shadow-pop outline-none",
          width
        )}
        style={{ animation: "clv-pop-in 0.2s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="font-display text-base font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rounded p-1 text-ink-mute hover:bg-paper-sunken hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
