"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Drawer } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { ApiError, api, errorMessage } from "@/lib/ui/client";
import { formatBytes, formatDateTime } from "@/lib/ui/format";
import type { MediaAsset, UsageRef } from "@/lib/ui/types";

/**
 * Asset detail drawer (FR-MEDIA-03/04): preview + metadata, editable alt text /
 * caption, "where used", and delete (handles the in-use 409 by showing the
 * blocking references).
 */
export function MediaDetailDrawer({
  asset,
  onClose,
  onUpdated,
  onDeleted,
}: {
  asset: MediaAsset | null;
  onClose: () => void;
  onUpdated: (asset: MediaAsset) => void;
  onDeleted: (id: string) => void;
}) {
  const toast = useToast();
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [usage, setUsage] = useState<UsageRef[] | null>(null);
  const [blockingRefs, setBlockingRefs] = useState<UsageRef[] | null>(null);

  useEffect(() => {
    if (!asset) return;
    setAltText(asset.altText ?? "");
    setCaption(asset.caption ?? "");
    setBlockingRefs(null);
    setUsage(null);
    api
      .get<{ references: UsageRef[] }>(`/api/media/${asset.id}/usage`)
      .then((r) => setUsage(r.references))
      .catch(() => setUsage([]));
  }, [asset]);

  if (!asset) return null;

  async function save() {
    if (!asset) return;
    setSaving(true);
    try {
      const updated = await api.patch<MediaAsset>(`/api/media/${asset.id}`, {
        altText: altText || null,
        caption: caption || null,
      });
      onUpdated(updated);
      toast.success("Metadata saved.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!asset) return;
    if (!confirm("Delete this asset?")) return;
    setDeleting(true);
    setBlockingRefs(null);
    try {
      await api.delete(`/api/media/${asset.id}`);
      toast.success("Asset deleted.");
      onDeleted(asset.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const refs = (e.details as { references?: UsageRef[] } | undefined)?.references;
        setBlockingRefs(refs ?? []);
        toast.error("This asset is still in use.");
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setDeleting(false);
    }
  }

  const dirty = altText !== (asset.altText ?? "") || caption !== (asset.caption ?? "");

  return (
    <Drawer open={Boolean(asset)} onClose={onClose} title="Media details">
      <div className="space-y-5">
        {/* Preview */}
        <div className="overflow-hidden rounded border border-line bg-paper-sunken">
          {asset.kind === "IMAGE" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.variants?.md ?? asset.url}
              alt={asset.altText ?? asset.filename}
              className="max-h-72 w-full object-contain"
            />
          ) : (
            <div className="grid h-40 place-items-center">
              <a
                href={asset.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-accent hover:underline"
              >
                Open {asset.kind} ↗
              </a>
            </div>
          )}
        </div>

        {/* Facts */}
        <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
          <dt className="text-ink-mute">Filename</dt>
          <dd className="truncate text-ink" title={asset.filename}>{asset.filename}</dd>
          <dt className="text-ink-mute">Type</dt>
          <dd className="text-ink">{asset.mimeType}</dd>
          <dt className="text-ink-mute">Size</dt>
          <dd className="text-ink">{formatBytes(asset.sizeBytes)}</dd>
          {asset.width && asset.height ? (
            <>
              <dt className="text-ink-mute">Dimensions</dt>
              <dd className="text-ink">{asset.width} × {asset.height}</dd>
            </>
          ) : null}
          <dt className="text-ink-mute">Uploaded</dt>
          <dd className="text-ink">{formatDateTime(asset.createdAt)}</dd>
        </dl>

        {/* Editable metadata */}
        <div className="space-y-3 border-t border-line pt-4">
          <Input
            label="Alt text"
            hint="for accessibility"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="Describe the image for screen readers"
          />
          <Textarea
            label="Caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={2}
          />
          <Button variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={save}>
            Save metadata
          </Button>
        </div>

        {/* Where used */}
        <div className="border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-ink">Where used</h3>
          {usage === null ? (
            <p className="mt-1 text-xs text-ink-mute">Checking…</p>
          ) : usage.length === 0 ? (
            <p className="mt-1 text-xs text-ink-mute">Not referenced anywhere.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {usage.map((ref) => (
                <li key={`${ref.type}-${ref.id}`} className="flex items-center gap-2 text-sm">
                  <Badge tone="neutral">{ref.type === "content" ? "Content" : "Author"}</Badge>
                  {ref.type === "content" ? (
                    <Link href={`/content/${ref.id}/edit`} className="truncate text-accent hover:underline">
                      {ref.title}
                    </Link>
                  ) : (
                    <span className="truncate text-ink">{ref.title}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Delete */}
        <div className="border-t border-line pt-4">
          {blockingRefs && blockingRefs.length > 0 ? (
            <div className="mb-2 rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
              Remove this asset from {blockingRefs.length} item
              {blockingRefs.length > 1 ? "s" : ""} before deleting.
            </div>
          ) : null}
          <Button variant="danger" size="sm" loading={deleting} onClick={remove}>
            Delete asset
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
