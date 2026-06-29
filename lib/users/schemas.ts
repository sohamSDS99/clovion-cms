/**
 * Zod validation for user management + author profiles (FR-USER-01, FR-USER-02).
 *
 * Pure schemas (no DB) so they can be unit-tested directly. Enum values are
 * UPPERCASE to match Prisma. Patch schemas use `.partial()`-style optionals so
 * callers can send only the fields they intend to change.
 */
import { z } from "zod";

export const ROLE_VALUES = [
  "ADMIN",
  "EDITOR",
  "AUTHOR",
  "CONTRIBUTOR",
  "VIEWER",
] as const;

export const USER_STATUS_VALUES = ["INVITED", "ACTIVE", "SUSPENDED"] as const;

export const roleEnum = z.enum(ROLE_VALUES);
export const userStatusEnum = z.enum(USER_STATUS_VALUES);

/** POST /api/users — invite a new user. */
export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email is required."),
  name: z.string().trim().min(1).max(120).optional(),
  role: roleEnum,
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

/**
 * PATCH /api/users/[id] — change role and/or status. At least one field must be
 * present so the request is meaningful.
 */
export const updateUserSchema = z
  .object({
    role: roleEnum.optional(),
    status: userStatusEnum.optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, {
    message: "Provide a role and/or status to change.",
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/**
 * POST /api/users/accept — UNAUTHENTICATED. Token-gated set-password flow.
 * Password min 8 (NFR-SEC). Name optional (a user may set it during accept).
 */
export const acceptInviteSchema = z.object({
  token: z.string().min(16, "Invalid invite token."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  name: z.string().trim().min(1).max(120).optional(),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/** A reasonable cap on social-link maps; keys are platform labels. */
const socialLinksSchema = z
  .record(z.string().trim().max(40), z.string().trim().url().max(500))
  .refine((m) => Object.keys(m).length <= 20, {
    message: "Too many social links.",
  });

/**
 * PATCH /api/profile or /api/author-profiles/[id] — author profile edit
 * (FR-USER-02). All fields optional; slug is editable and validated to the
 * content slug charset. `avatarAssetId` may be cleared by sending null.
 */
export const updateAuthorProfileSchema = z
  .object({
    displayName: z.string().trim().min(1, "Display name is required.").max(160).optional(),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.")
      .optional(),
    title: z.string().trim().max(120).optional(),
    bio: z.string().trim().max(2000).optional(),
    socialLinks: socialLinksSchema.optional(),
    avatarAssetId: z.string().uuid().nullable().optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateAuthorProfileInput = z.infer<typeof updateAuthorProfileSchema>;
