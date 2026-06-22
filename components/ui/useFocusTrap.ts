"use client";

/**
 * Focus-trap + dialog-lifecycle hook for Modal/Drawer (NFR-A11Y-01, WCAG 2.1 AA).
 *
 * Additive helper — it does not change any component prop signatures. Given a ref
 * to the dialog container and an `open` flag + `onClose`, it:
 *   - records the element that had focus and restores it on close (2.4.3),
 *   - moves focus to the first focusable element (or the container) on open,
 *   - traps Tab/Shift+Tab within the dialog so focus cannot leak to the page,
 *   - closes on Escape,
 *   - locks background scroll while open.
 *
 * Returns nothing; purely side-effectful via the passed ref.
 */

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href],area[href],input:not([disabled]):not([type="hidden"]),' +
  "select:not([disabled]),textarea:not([disabled]),button:not([disabled])," +
  '[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    const container = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the dialog after paint.
    const raf = requestAnimationFrame(() => {
      if (!container) return;
      const focusables = focusableWithin(container);
      (focusables[0] ?? container).focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !container) return;

      const focusables = focusableWithin(container);
      if (focusables.length === 0) {
        // Nothing focusable — keep focus on the container itself.
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      // Restore focus to the opener (WCAG 2.4.3 focus order).
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, ref]);
}
