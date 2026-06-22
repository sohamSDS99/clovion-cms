"use client";

import { Badge } from "@/components/ui/Badge";

/**
 * Persistent "AI-assisted — review before publish" badge (FR-EDITOR-08).
 *
 * Shown when the current revision originated from AI generation and a human has
 * not yet saved a manual revision over it. The parent decides visibility from
 * the item's current revision source (best-effort) plus a per-session flag set
 * right after an AI insert.
 */
export function AiAssistedBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Badge tone="review" className="gap-1.5">
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        aria-hidden="true"
      >
        <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M7 7 5.5 5.5M17 7l1.5-1.5M7 17l-1.5 1.5M17 17l1.5 1.5" />
        <circle cx="12" cy="12" r="3.5" />
      </svg>
      AI-assisted — review before publish
    </Badge>
  );
}
