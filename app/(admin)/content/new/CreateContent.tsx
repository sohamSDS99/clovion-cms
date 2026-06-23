"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { InlineError, Spinner } from "@/components/ui/Feedback";
import { api, errorMessage } from "@/lib/ui/client";
import { CONTENT_TYPES, contentTypeLabel } from "@/lib/ui/format";
import { cn } from "@/lib/ui/cn";
import type { ContentItem, ContentType } from "@/lib/ui/types";

/** Coerce the ?type param to a valid ContentType, defaulting to BLOG. */
function resolveType(raw: string | null): ContentType {
  const upper = (raw ?? "").toUpperCase();
  return (CONTENT_TYPES as string[]).includes(upper)
    ? (upper as ContentType)
    : "BLOG";
}

/**
 * Auto-create a fresh DRAFT of the requested type and redirect into the editor.
 * Mirrors the NewContentButton create pattern (FR-CONTENT-01); used by the
 * sidebar "Create New" links (/content/new?type=<TYPE>).
 */
export function CreateContent() {
  const router = useRouter();
  const params = useSearchParams();
  const type = resolveType(params.get("type"));
  const label = contentTypeLabel(type);

  const [error, setError] = useState<string | null>(null);
  // Guard against React strict-mode double-mount creating two drafts.
  const started = useRef(false);

  const create = useCallback(async () => {
    setError(null);
    try {
      const item = await api.post<ContentItem>("/api/content", {
        type,
        title: `Untitled ${label}`,
      });
      router.replace(`/content/${item.id}/edit`);
    } catch (e) {
      started.current = false; // allow retry
      setError(errorMessage(e));
    }
  }, [type, label, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void create();
  }, [create]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="max-w-md">
          <InlineError message={error} />
        </div>
        <p className="text-sm text-ink-mute">
          We couldn’t create your {label.toLowerCase()} draft.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            onClick={() => {
              started.current = true;
              void create();
            }}
          >
            Try again
          </Button>
          <Link
            href={`/content?type=${type}&status=DRAFT`}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-sm border border-line-strong bg-paper-raised px-4 text-sm font-medium text-ink transition-colors duration-150 hover:bg-paper-sunken"
            )}
          >
            Back to {label} drafts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <Spinner className="h-6 w-6" />
      <p className="text-sm text-ink-mute">Creating {label}…</p>
    </div>
  );
}
