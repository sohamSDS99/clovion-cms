"use client";

import { useEffect, useState } from "react";
import { PageHeader, PageBody } from "@/components/shell/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Label } from "@/components/ui/Field";
import { Loading, InlineError, EmptyState } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { MediaPicker } from "@/components/media/MediaPicker";
import { api, errorMessage } from "@/lib/ui/client";
import type { AuthorProfile } from "./types";
import type { MediaAsset } from "@/lib/ui/types";

interface ProfileResponse {
  profile: AuthorProfile | null;
}

/** A single editable social link row. */
interface SocialRow {
  key: string;
  url: string;
}

function toRows(links: Record<string, string>): SocialRow[] {
  return Object.entries(links).map(([key, url]) => ({ key, url }));
}

function fromRows(rows: SocialRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const key = r.key.trim();
    const url = r.url.trim();
    if (key && url) out[key] = url;
  }
  return out;
}

/**
 * Author-profile editor (FR-USER-02): edit the current user's display name,
 * slug, bio, social links, public toggle, and avatar (via the shared
 * MediaPicker). PATCHes /api/profile.
 */
export function ProfileEditor() {
  const toast = useToast();
  const [profile, setProfile] = useState<AuthorProfile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [avatarAssetId, setAvatarAssetId] = useState<string | null>(null);
  const [social, setSocial] = useState<SocialRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    api
      .get<ProfileResponse>("/api/profile")
      .then((r) => {
        setProfile(r.profile);
        if (r.profile) {
          setDisplayName(r.profile.displayName);
          setSlug(r.profile.slug);
          setBio(r.profile.bio ?? "");
          setIsPublic(r.profile.isPublic);
          setAvatarAssetId(r.profile.avatarAssetId);
          setSocial(toRows(r.profile.socialLinks ?? {}));
        }
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.patch<AuthorProfile>("/api/profile", {
        displayName: displayName.trim(),
        slug: slug.trim(),
        bio: bio.trim(),
        isPublic,
        avatarAssetId,
        socialLinks: fromRows(social),
      });
      setProfile(updated);
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function updateRow(i: number, patch: Partial<SocialRow>) {
    setSocial((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  if (error) {
    return (
      <>
        <PageHeader title="My profile" />
        <PageBody>
          <InlineError message={error} />
        </PageBody>
      </>
    );
  }

  if (profile === undefined) {
    return (
      <>
        <PageHeader title="My profile" />
        <PageBody>
          <Loading label="Loading profile…" />
        </PageBody>
      </>
    );
  }

  if (profile === null) {
    return (
      <>
        <PageHeader title="My profile" />
        <PageBody>
          <EmptyState
            title="No author profile"
            description="Your account doesn't have an author profile. Viewers don't have a public byline."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="My profile"
        description="Your public author byline (FR-USER-02)."
        actions={
          <Button
            variant="primary"
            type="submit"
            form="profile-form"
            loading={saving}
          >
            Save changes
          </Button>
        }
      />
      <PageBody>
        <form id="profile-form" onSubmit={save} className="mx-auto flex max-w-2xl flex-col gap-5">
          <Card>
            <CardHeader title="Identity" />
            <div className="flex flex-col gap-4 px-5 py-4">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-paper-sunken text-lg font-semibold text-ink-soft">
                  {avatarAssetId ? (
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
                        onClick={() => setAvatarAssetId(null)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <Input
                label="Display name"
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
              <Textarea
                label="Bio"
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A short bio shown on your public byline."
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Social links"
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSocial((r) => [...r, { key: "", url: "" }])}
                >
                  Add link
                </Button>
              }
            />
            <div className="flex flex-col gap-3 px-5 py-4">
              {social.length === 0 ? (
                <p className="text-sm text-ink-mute">No social links yet.</p>
              ) : (
                social.map((row, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Input
                      label={i === 0 ? "Platform" : undefined}
                      placeholder="twitter"
                      value={row.key}
                      onChange={(e) => updateRow(i, { key: e.target.value })}
                      className="w-40"
                    />
                    <Input
                      label={i === 0 ? "URL" : undefined}
                      placeholder="https://…"
                      value={row.url}
                      onChange={(e) => updateRow(i, { url: e.target.value })}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Remove link"
                      onClick={() => setSocial((rows) => rows.filter((_, idx) => idx !== i))}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-ink">Public profile</p>
                <p className="text-xs text-ink-mute">
                  When on, your byline can appear on published content.
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
          </Card>
        </form>
      </PageBody>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        kind="IMAGE"
        title="Choose avatar"
        onPick={(asset: MediaAsset) => {
          setAvatarAssetId(asset.id);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
