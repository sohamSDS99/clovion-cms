"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState, InlineError, Loading } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { MediaDetailDrawer } from "./MediaDetailDrawer";
import { api, errorMessage } from "@/lib/ui/client";
import { cn } from "@/lib/ui/cn";
import { formatBytes } from "@/lib/ui/format";
import type { MediaAsset, MediaKind } from "@/lib/ui/types";

interface ListResponse {
  items: MediaAsset[];
  nextCursor: string | null;
}

const KINDS: (MediaKind | "")[] = ["", "IMAGE", "VIDEO", "PDF", "OTHER"];

/**
 * Media library (FR-MEDIA-03/04): grid of assets with thumb variants, drag/drop
 * + file-input upload, search + kind filter, and a detail drawer for metadata
 * editing, where-used, and delete (with in-use 409 handling).
 */
export function MediaLibrary() {
  const toast = useToast();
  const [items, setItems] = useState<MediaAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<MediaKind | "">("");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setItems(null);
      setError(null);
      api
        .get<ListResponse>(
          "/api/media",
          { kind: kind || undefined, q: search || undefined },
          signal
        )
        .then((r) => setItems(r.items))
        .catch((e) => !signal?.aborted && setError(errorMessage(e)));
    },
    [kind, search]
  );

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        const form = new FormData();
        form.append("file", file);
        await api.upload<MediaAsset>("/api/media", form);
        ok++;
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e)}`);
      }
    }
    setUploading(false);
    if (ok > 0) {
      toast.success(`Uploaded ${ok} file${ok > 1 ? "s" : ""}.`);
      load();
    }
  }

  return (
    <>
      <PageHeader
        title="Media"
        description="Images, video, and documents used across your content."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button variant="primary" loading={uploading} onClick={() => fileRef.current?.click()}>
              Upload
            </Button>
          </>
        }
      />
      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename, alt text, caption…"
              aria-label="Search media"
              className="h-10 w-full rounded-sm border border-line-strong bg-paper-raised px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </div>
          <div className="flex gap-1">
            {KINDS.map((k) => (
              <button
                key={k || "all"}
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-sm border px-3 py-2 text-sm transition-colors",
                  kind === k
                    ? "border-accent bg-accent-soft text-accent-ink"
                    : "border-line-strong text-ink-soft hover:bg-paper-sunken"
                )}
              >
                {k || "All"}
              </button>
            ))}
          </div>
        </div>

        {error ? <InlineError message={error} /> : null}

        {/* Drop zone wrapping the grid */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
          }}
          className={cn(
            "rounded border-2 border-dashed p-2 transition-colors",
            dragging ? "border-accent bg-accent-soft/40" : "border-transparent"
          )}
        >
          {items === null && !error ? (
            <Loading />
          ) : items && items.length === 0 ? (
            <EmptyState
              title="No media yet"
              description="Drag files here or use the Upload button."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {items?.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className="group flex flex-col overflow-hidden rounded border border-line bg-paper-raised text-left shadow-card transition-all hover:border-line-strong hover:shadow-raised"
                >
                  <span className="grid aspect-square place-items-center bg-paper-sunken">
                    {a.kind === "IMAGE" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.variants?.thumb ?? a.variants?.md ?? a.url}
                        alt={a.altText ?? a.filename}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
                        {a.kind}
                      </span>
                    )}
                  </span>
                  <span className="px-2.5 py-2">
                    <span className="block truncate text-xs font-medium text-ink">
                      {a.filename}
                    </span>
                    <span className="text-[11px] text-ink-faint">
                      {formatBytes(a.sizeBytes)}
                      {!a.altText && a.kind === "IMAGE" ? (
                        <span className="ml-1 text-warn">· no alt</span>
                      ) : null}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </PageBody>

      <MediaDetailDrawer
        asset={selected}
        onClose={() => setSelected(null)}
        onUpdated={(updated) => {
          setItems((prev) =>
            prev ? prev.map((a) => (a.id === updated.id ? updated : a)) : prev
          );
          setSelected(updated);
        }}
        onDeleted={(id) => {
          setItems((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
          setSelected(null);
        }}
      />
    </>
  );
}
