"use client";

import { cn } from "@/lib/ui/cn";
import type { BadgeTone } from "@/lib/ui/format";

const tones: Record<BadgeTone, string> = {
  draft: "bg-paper-sunken text-ink-mute border-line-strong",
  review: "bg-warn-soft text-warn border-warn/25",
  scheduled: "bg-[#e7eef7] text-[#2563a8] border-[#2563a8]/20",
  published: "bg-accent-soft text-accent-ink border-accent/25",
  unpublished: "bg-[#f4ece3] text-[#9a5b2c] border-[#9a5b2c]/25",
  archived: "bg-paper-sunken text-ink-faint border-line",
  neutral: "bg-paper-sunken text-ink-soft border-line-strong",
  accent: "bg-accent-soft text-accent-ink border-accent/25",
};

/** Compact, low-chroma status pill. */
export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none tracking-wide",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
