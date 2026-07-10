/**
 * Client-side shape for the admin Author Profiles screen. Mirrors (does not
 * import) the `AuthorProfileAdminRow` payload from `lib/users/service` so the
 * client bundle stays server-free.
 */
export interface AuthorProfileAdminRow {
  id: string;
  displayName: string;
  slug: string;
  title: string | null;
  bio: string | null;
  avatarAssetId: string | null;
  avatarUrl: string | null;
  socialLinks: Record<string, string>;
  isPublic: boolean;
  isGhost: boolean;
  createdAt: string;
  createdByEmail: string | null;
}
