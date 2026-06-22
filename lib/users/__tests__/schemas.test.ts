/**
 * Pure unit tests for the user/profile zod schemas (FR-USER-01, FR-USER-02).
 */
import { describe, it, expect } from "vitest";
import {
  inviteUserSchema,
  updateUserSchema,
  acceptInviteSchema,
  updateAuthorProfileSchema,
} from "@/lib/users/schemas";

describe("inviteUserSchema", () => {
  it("accepts a valid invite and normalizes email", () => {
    const r = inviteUserSchema.parse({ email: "  Foo@Bar.COM ", role: "AUTHOR" });
    expect(r.email).toBe("foo@bar.com");
    expect(r.role).toBe("AUTHOR");
  });

  it("rejects an invalid email", () => {
    expect(inviteUserSchema.safeParse({ email: "nope", role: "AUTHOR" }).success).toBe(false);
  });

  it("rejects an unknown role", () => {
    expect(inviteUserSchema.safeParse({ email: "a@b.com", role: "ROOT" }).success).toBe(false);
  });

  it("allows an optional name", () => {
    const r = inviteUserSchema.parse({ email: "a@b.com", role: "VIEWER", name: " Jo " });
    expect(r.name).toBe("Jo");
  });
});

describe("updateUserSchema", () => {
  it("accepts a role-only change", () => {
    expect(updateUserSchema.safeParse({ role: "EDITOR" }).success).toBe(true);
  });
  it("accepts a status-only change", () => {
    expect(updateUserSchema.safeParse({ status: "SUSPENDED" }).success).toBe(true);
  });
  it("rejects an empty patch", () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
  });
  it("rejects a bad status enum", () => {
    expect(updateUserSchema.safeParse({ status: "DELETED" }).success).toBe(false);
  });
});

describe("acceptInviteSchema", () => {
  it("accepts a valid token + password", () => {
    expect(
      acceptInviteSchema.safeParse({ token: "x".repeat(64), password: "hunter22" }).success
    ).toBe(true);
  });
  it("rejects a short password", () => {
    expect(
      acceptInviteSchema.safeParse({ token: "x".repeat(64), password: "short" }).success
    ).toBe(false);
  });
  it("rejects a too-short token", () => {
    expect(acceptInviteSchema.safeParse({ token: "abc", password: "longenough" }).success).toBe(
      false
    );
  });
});

describe("updateAuthorProfileSchema", () => {
  it("accepts a partial patch", () => {
    expect(updateAuthorProfileSchema.safeParse({ displayName: "Ada" }).success).toBe(true);
  });
  it("rejects an empty patch", () => {
    expect(updateAuthorProfileSchema.safeParse({}).success).toBe(false);
  });
  it("accepts a valid slug", () => {
    expect(updateAuthorProfileSchema.safeParse({ slug: "ada-lovelace" }).success).toBe(true);
  });
  it("rejects an invalid slug", () => {
    expect(updateAuthorProfileSchema.safeParse({ slug: "Ada Lovelace" }).success).toBe(false);
    expect(updateAuthorProfileSchema.safeParse({ slug: "-bad-" }).success).toBe(false);
  });
  it("allows clearing the avatar with null", () => {
    expect(updateAuthorProfileSchema.safeParse({ avatarAssetId: null }).success).toBe(true);
  });
  it("validates social link URLs", () => {
    expect(
      updateAuthorProfileSchema.safeParse({ socialLinks: { x: "https://x.com/a" } }).success
    ).toBe(true);
    expect(
      updateAuthorProfileSchema.safeParse({ socialLinks: { x: "not-a-url" } }).success
    ).toBe(false);
  });
});
