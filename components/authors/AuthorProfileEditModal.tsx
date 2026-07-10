"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Label } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { MediaPicker } from "@/components/media/MediaPicker";
import { api, errorMessage, normalizeLinkedInUrl } from "@/lib/ui/client";
import type { MediaAsset } from "@/lib/ui/types";
import type { AuthorProfileAdminRow } from "./types";

const BIO_MAX = 500;

/**
 * Admin editor for a single author profile (FR-USER-02). PATCHes
 * /api/author-profiles/[id] (Admin-only; the service enforces own-vs-others).
 * LinkedIn is edited via a dedicated field that reads/writes
 * `socialLinks.linkedin`. Field patterns mirror ProfileEditor but are scoped to
 * the passed-in profile.
 */
export function AuthorProfileEditModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: AuthorProfileAdminRow | null;
  onClose: () => void;
  onSaved: (updated: AuthorProfileAdminRow) => void;
}) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [avatarAssetId, setAvatarAssetId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Hydrate the form whenever a different profile is opened.
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setSlug(profile.slug);
    setTitle(profile.title ?? "");
    setLinkedin(profile.socialLinks?.linkedin ?? "");
    setBio(profile.bio ?? "");
    setIsPublic(profile.isPublic);
    setAvatarAssetId(profile.avatarAssetId);
    setAvatarUrl(profile.avatarUrl ?? null);
  }, [profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      // Preserve any other social links; only manage `linkedin` here. Normalize
      // to an absolute URL so the server's strict .url() check doesn't 400.
      const socialLinks: Record<string, string> = { ...(profile.socialLinks ?? {}) };
      const link = normalizeLinkedInUrl(linkedin);
      if (link) socialLinks.linkedin = link;
      else delete socialLinks.linkedin;

      const updated = await api.patch<AuthorProfileAdminRow>(
        `/api/author-profiles/${profile.id}`,
        {
          displayName: displayName.trim(),
          slug: slug.trim(),
          // Cleared → null (not ""), matching how profiles are created.
          title: title.trim() || null,
          bio: bio.trim() || null,
          isPublic,
          avatarAssetId,
          socialLinks,
        }
      );
      // The PATCH route returns the AuthorProfilePayload shape (no createdByEmail);
      // merge onto the existing row so the list keeps its resolved metadata.
      onSaved({
        ...profile,
        displayName: updated.displayName,
        slug: updated.slug,
        title: updated.title,
        bio: updated.bio,
        avatarAssetId: updated.avatarAssetId,
        // Only trust the local thumbnail when the server echoed the SAME asset id
        // we sent; otherwise fall back to the placeholder (a list reload will
        // re-resolve the correct URL) rather than show a mismatched thumbnail.
        avatarUrl:
          updated.avatarAssetId && updated.avatarAssetId === avatarAssetId
            ? avatarUrl
            : null,
        socialLinks: (updated.socialLinks ?? {}) as Record<string, string>,
        isPublic: updated.isPublic,
      });
      toast.success("Author profile saved.");
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
        open={profile !== null}
        onClose={onClose}
        title="Edit author profile"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="author-profile-form"
              loading={saving}
            >
              Save changes
            </Button>
          </>
        }
      >
        {profile ? (
          <form
            id="author-profile-form"
            onSubmit={save}
            className="flex flex-col gap-4"
          >
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
                ) : avatarAssetId ? (
                  <span className="text-xs text-ink-mute">Set</span>
                ) : (
                  (displayName || "A").slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Avatar</Label>
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
              hint="lowercase, hyphenated"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <Input
              label="Job title"
              placeholder="e.g. Content Manager"
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
        ) : null}
      </Modal>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        kind="IMAGE"
        title="Choose avatar"
        onPick={(asset: MediaAsset) => {
          setAvatarAssetId(asset.id);
          setAvatarUrl(asset.variants?.thumb ?? asset.url);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
