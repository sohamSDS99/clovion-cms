"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MediaPicker } from "@/components/media/MediaPicker";
import { api } from "@/lib/ui/client";
import type { MediaAsset } from "@/lib/ui/types";

/**
 * Cover image control (FR-EDITOR-04): pick/upload an asset to set
 * `coverAssetId`. Resolves the current asset to show a thumbnail.
 */
export function CoverImage({
  coverAssetId,
  onChange,
  error,
}: {
  coverAssetId: string | null;
  onChange: (id: string | null) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [asset, setAsset] = useState<MediaAsset | null>(null);

  useEffect(() => {
    if (!coverAssetId) {
      setAsset(null);
      return;
    }
    let active = true;
    api
      .get<MediaAsset>(`/api/media/${coverAssetId}`)
      .then((a) => active && setAsset(a))
      .catch(() => active && setAsset(null));
    return () => {
      active = false;
    };
  }, [coverAssetId]);

  return (
    <Card>
      <CardHeader title="Cover image" />
      <div className="p-5">
        {coverAssetId ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-sm border border-line bg-paper-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset?.variants?.md ?? asset?.url}
                alt={asset?.altText ?? "Cover image"}
                className="aspect-[16/9] w-full object-cover"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
                Replace
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-line-strong bg-paper text-ink-mute transition-colors hover:border-accent hover:text-accent"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" />
            </svg>
            <span className="text-sm font-medium">Set a cover image</span>
          </button>
        )}
        {error ? <p className="mt-2 text-xs text-danger" role="alert">{error}</p> : null}
      </div>

      <MediaPicker
        open={open}
        onClose={() => setOpen(false)}
        kind="IMAGE"
        title="Choose cover image"
        onPick={(a) => onChange(a.id)}
      />
    </Card>
  );
}
