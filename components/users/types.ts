/**
 * Client-side shapes for the user-management UI. Mirrors (does not import) the
 * Prisma/service payloads so the client bundle stays server-free.
 */
import type { Role } from "@/lib/ui/types";

export type UserStatus = "INVITED" | "ACTIVE" | "SUSPENDED";

export interface UserProfileSummary {
  id: string;
  displayName: string;
  slug: string;
  isPublic: boolean;
  avatarAssetId: string | null;
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  status: UserStatus;
  authorProfileId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorProfile: UserProfileSummary | null;
}

export interface InviteResult {
  user: UserRow;
  acceptUrl: string;
  delivered: boolean;
}

export interface AuthorProfile {
  id: string;
  displayName: string;
  slug: string;
  title: string | null;
  bio: string | null;
  avatarAssetId: string | null;
  socialLinks: Record<string, string>;
  isPublic: boolean;
  isGhost: boolean;
  createdAt: string;
  updatedAt: string;
}

export const ROLE_OPTIONS: Role[] = [
  "ADMIN",
  "EDITOR",
  "AUTHOR",
  "CONTRIBUTOR",
  "VIEWER",
];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  EDITOR: "Editor",
  AUTHOR: "Author",
  CONTRIBUTOR: "Contributor",
  VIEWER: "Viewer",
};

export const STATUS_LABEL: Record<UserStatus, string> = {
  INVITED: "Invited",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
};

/** Map a user status to a Badge tone. */
export function statusTone(status: UserStatus): "accent" | "review" | "draft" {
  switch (status) {
    case "ACTIVE":
      return "accent";
    case "INVITED":
      return "review";
    case "SUSPENDED":
      return "draft";
  }
}
