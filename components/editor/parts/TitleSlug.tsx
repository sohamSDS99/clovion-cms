"use client";

import { slugFromTitle } from "@/lib/ui/format";
import type { ContentItem } from "@/lib/ui/types";
import type { Draft } from "../layouts/types";

/** Shared title + per-type slug header used by every editor layout. */
export function TitleSlug({
  draft,
  update,
  item,
  gateErrors,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  item: ContentItem;
  gateErrors: Record<string, string>;
}) {
  return (
    <div className="space-y-2">
      <input
        value={draft.title}
        onChange={(e) => update({ title: e.target.value })}
        placeholder="Untitled"
        aria-label="Title"
        className="w-full bg-transparent font-display text-3xl font-semibold tracking-tight text-ink placeholder:text-ink-faint focus:outline-none"
      />
      {gateErrors.title ? <p className="text-xs text-danger">{gateErrors.title}</p> : null}

      <div className="flex items-center gap-1 text-sm text-ink-mute">
        <span className="text-ink-faint">/{item.type.toLowerCase()}/</span>
        <input
          value={draft.slug}
          onChange={(e) =>
            update({ slug: slugFromTitle(e.target.value), slugTouched: true })
          }
          placeholder="slug"
          aria-label="Slug"
          className="flex-1 bg-transparent text-accent focus:outline-none"
        />
      </div>
      {gateErrors.slug ? <p className="text-xs text-danger">{gateErrors.slug}</p> : null}
    </div>
  );
}
