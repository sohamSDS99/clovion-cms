"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/ui/client";
import { CONTENT_TYPES, contentTypeLabel } from "@/lib/ui/format";
import type { ContentItem, ContentType } from "@/lib/ui/types";

/**
 * "New" dropdown: pick a type, POST /api/content to create a DRAFT, then route
 * straight into the editor (FR-CONTENT-01).
 */
export function NewContentButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<ContentType | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function create(type: ContentType) {
    setCreating(type);
    try {
      const item = await api.post<ContentItem>("/api/content", {
        type,
        title: `Untitled ${contentTypeLabel(type)}`,
      });
      router.push(`/content/${item.id}/edit`);
    } catch (e) {
      toast.error(errorMessage(e));
      setCreating(null);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="primary"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        loading={creating !== null}
      >
        New
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-48 overflow-hidden rounded border border-line bg-paper-raised shadow-pop clv-pop-in"
        >
          {CONTENT_TYPES.map((type) => (
            <button
              key={type}
              role="menuitem"
              disabled={creating !== null}
              onClick={() => create(type)}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm text-ink-soft hover:bg-paper-sunken hover:text-ink disabled:opacity-50"
            >
              {contentTypeLabel(type)}
              {creating === type ? (
                <span className="text-xs text-ink-mute">Creating…</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
