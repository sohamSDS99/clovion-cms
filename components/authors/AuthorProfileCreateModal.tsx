"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Label } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { MediaPicker } from "@/components/media/MediaPicker";
import { api, errorMessage, normalizeLinkedInUrl } from "@/lib/ui/client";
import type { MediaAsset } from "@/lib/ui/types";

const BIO_MAX = 500;

/**
 * Admin — create a login-less byline author profile directly (isGhost), without
 * inviting anyone. POSTs /api/author-profiles (Admin-only). Slug is optional:
 * left blank, the server derives it from the name. Separate from the invite
 * flow, which provisions an account for someone who logs in and self-edits.
 */
export function AuthorProfileCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [avatarAssetId, setAvatarAssetId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Reset to a blank form each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setDisplayName("");
    setSlug("");
    setTitle("");
    setLinkedin("");
    setBio("");
    setIsPublic(true);
    setAvatarAssetId(null);
    setAvatarUrl(null);
  }, [open]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const link = normalizeLinkedInUrl(linkedin);
      await api.post("/api/author-profiles", {
        displayName: displayName.trim(),
        // Omit slug when blank so the server derives a unique one from the name.
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        title: title.trim() || null,
        bio: bio.trim() || null,
        isPublic,
        avatarAssetId,
        socialLinks: link ? { linkedin: link } : {},
      });
      toast.success("Author profile created.");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const bioLen = bio.trim().length;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Create author profile"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="author-profile-create-form"
              loading={saving}
              disabled={displayName.trim().length === 0}
            >
              Create profile
            </Button>
          </>
        }
      >
        <form
          id="author-profile-create-form"
          onSubmit={create}
          className="flex flex-col gap-4"
        >
          <p className="text-xs text-ink-mute">
            A byline-only profile with no login — ideal for guest authors. To
            give someone CMS access instead, use “Invite author”.
          </p>

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-paper-sunken text-lg font-semibold text-ink-soft">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setAvatarUrl(null)}
                />
              ) : (
                (displayName || "A").slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Image</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  {avatarAssetId ? "Change" : "Choose image"}
                </Button>
                {avatarAssetId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAvatarAssetId(null);
                      setAvatarUrl(null);
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <Input
            label="Full name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            label="Slug"
            hint="Optional — generated from the name if left blank"
            placeholder="e.g. jane-doe"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <Input
            label="Job title"
            placeholder="e.g. Workplace Safety Expert"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            label="LinkedIn URL"
            type="url"
            placeholder="https://www.linkedin.com/in/…"
            value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)}
          />
          <Textarea
            label="Short bio"
            hint={`${bioLen}/${BIO_MAX} characters`}
            rows={4}
            maxLength={BIO_MAX}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short bio shown on the public byline."
          />

          <div className="flex items-center justify-between rounded border border-line bg-paper-raised px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink">Public profile</p>
              <p className="text-xs text-ink-mute">
                When on, this byline can appear on published content.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {isPublic ? "Public" : "Private"}
            </label>
          </div>
        </form>
      </Modal>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        kind="IMAGE"
        title="Choose image"
        onPick={(asset: MediaAsset) => {
          setAvatarAssetId(asset.id);
          setAvatarUrl(asset.variants?.thumb ?? asset.url);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
