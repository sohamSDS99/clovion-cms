"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Loading, InlineError, EmptyState } from "@/components/ui/Feedback";
import { api, errorMessage } from "@/lib/ui/client";
import { cn } from "@/lib/ui/cn";
import { formatBytes } from "@/lib/ui/format";
import type { MediaAsset, MediaKind } from "@/lib/ui/types";

interface ListResponse {
  items: MediaAsset[];
  nextCursor: string | null;
}

/**
 * Reusable asset picker (FR-EDITOR-02/04, FR-MEDIA-03). Lets the user pick an
 * existing asset or upload a new one inline, then returns the chosen asset.
 * `kind` constrains the library view (e.g. IMAGE for covers, PDF for resources).
 */
export function MediaPicker({
  open,
  onClose,
  onPick,
  kind = "IMAGE",
  title = "Choose media",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (asset: MediaAsset) => void;
  kind?: MediaKind;
  title?: string;
}) {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function refresh(q?: string) {
    setAssets(null);
    setError(null);
    api
      .get<ListResponse>("/api/media", { kind, q: q || undefined })
      .then((r) => setAssets(r.items))
      .catch((e) => setError(errorMessage(e)));
  }

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const asset = await api.upload<MediaAsset>("/api/media", form);
      onPick(asset);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && refresh(search)}
          placeholder="Search library…"
          aria-label="Search media"
          className="h-9 flex-1 rounded-sm border border-line-strong bg-paper-raised px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
        />
        <input
          ref={fileRef}
          type="file"
          hidden
          accept={kind === "IMAGE" ? "image/*" : kind === "PDF" ? "application/pdf" : undefined}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <Button
          variant="primary"
          size="sm"
          loading={uploading}
          onClick={() => fileRef.current?.click()}
        >
          Upload new
        </Button>
      </div>

      {error ? <div className="mt-3"><InlineError message={error} /></div> : null}

      <div className="mt-3 max-h-[50vh] overflow-y-auto">
        {assets === null ? (
          <Loading />
        ) : assets.length === 0 ? (
          <EmptyState
            title="No assets yet"
            description="Upload a file to add it to the library."
          />
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {assets.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  onPick(a);
                  onClose();
                }}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-sm border border-line bg-paper-raised text-left transition-colors hover:border-accent"
                )}
              >
                <span className="grid aspect-[4/3] place-items-center bg-paper-sunken">
                  {a.kind === "IMAGE" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.variants?.thumb ?? a.url}
                      alt={a.altText ?? a.filename}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-medium uppercase text-ink-mute">
                      {a.kind}
                    </span>
                  )}
                </span>
                <span className="truncate px-2 py-1.5 text-xs text-ink-soft">
                  {a.filename}
                  <span className="block text-[10px] text-ink-faint">
                    {formatBytes(a.sizeBytes)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
