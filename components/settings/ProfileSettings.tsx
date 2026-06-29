"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Label } from "@/components/ui/Field";
import { Loading, InlineError, EmptyState } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { MediaPicker } from "@/components/media/MediaPicker";
import { api, errorMessage } from "@/lib/ui/client";
import { formatDateTime } from "@/lib/ui/format";
import type { AuthorProfile } from "@/components/users/types";
import type { MediaAsset } from "@/lib/ui/types";

interface ProfileResponse {
  profile: AuthorProfile | null;
}

/**
 * Settings → Profile Settings tab. Edits the acting user's AuthorProfile —
 * the byline (name, title, bio, avatar) shown alongside their published
 * content on the public site. PATCHes /api/profile.
 */
export function ProfileSettings({ email }: { email: string }) {
  const toast = useToast();
  const [profile, setProfile] = useState<AuthorProfile | null | undefined>(
    undefined
  );
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [avatarAssetId, setAvatarAssetId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    api
      .get<ProfileResponse>("/api/profile")
      .then((r) => {
        setProfile(r.profile);
        if (r.profile) {
          setDisplayName(r.profile.displayName);
          setTitle(r.profile.title ?? "");
          setBio(r.profile.bio ?? "");
          setAvatarAssetId(r.profile.avatarAssetId);
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
        title: title.trim(),
        bio: bio.trim(),
        avatarAssetId,
      });
      setProfile(updated);
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (error) return <InlineError message={error} />;
  if (profile === undefined) return <Loading label="Loading profile…" />;

  if (profile === null) {
    return (
      <EmptyState
        title="No author profile"
        description="Your account doesn't have an author profile, so you have no public byline."
      />
    );
  }

  return (
    <>
      <form onSubmit={save} className="mx-auto max-w-3xl">
        <Card className="overflow-hidden">
          {/* Header */}
          <div className="border-b border-line px-6 py-5">
            <h3 className="text-lg font-semibold text-ink">Profile</h3>
            <p className="mt-0.5 text-sm text-ink-mute">
              Shown as the default author identity for your content.
            </p>
          </div>

          <div className="flex flex-col gap-5 px-6 py-6">
            {/* Avatar + live identity preview */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-paper-sunken text-ink-faint">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <IconUser />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  aria-label="Change avatar"
                  className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-line bg-paper-raised text-ink-soft shadow-card transition-colors hover:bg-paper-sunken"
                >
                  <IconCamera />
                </button>
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-ink">
                  {displayName || "Your name"}
                </p>
                <p className="truncate text-sm text-ink-mute">
                  {title || "Your role"}
                </p>
                {avatarAssetId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarAssetId(null);
                      setAvatarUrl(null);
                    }}
                    className="mt-1 text-xs text-ink-mute underline underline-offset-2 hover:text-ink"
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
            </div>

            {/* Name + email */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Display name"
                required
                placeholder="Jane Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <div>
                <Label>Email</Label>
                <Input
                  value={email}
                  readOnly
                  disabled
                  hint="Your account email (managed in User Management)."
                />
              </div>
            </div>

            <Input
              label="Title / role"
              placeholder="Content Manager"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <Textarea
              label="Bio"
              rows={5}
              placeholder="A short bio shown alongside your author profile."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
            <p className="text-xs text-ink-mute">
              Last updated {formatDateTime(profile.updatedAt)}
            </p>
            <Button variant="primary" type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </Card>
      </form>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        kind="IMAGE"
        title="Choose avatar"
        onPick={(asset: MediaAsset) => {
          setAvatarAssetId(asset.id);
          setAvatarUrl(asset.url ?? null);
          setPickerOpen(false);
        }}
      />
    </>
  );
}

function IconUser() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  );
}
function IconCamera() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
