/**
 * Pure unit tests for the user-management logic (FR-USER-01).
 * No Prisma / Auth / email — only the extracted pure helpers.
 */
import { describe, it, expect } from "vitest";
import {
  isLastActiveAdmin,
  isInviteValid,
  inviteExpiry,
  authorSlugSeed,
  INVITE_TTL_MS,
  type AdminGuardUser,
} from "@/lib/users/logic";

const admin = (id: string, status: AdminGuardUser["status"] = "ACTIVE"): AdminGuardUser => ({
  id,
  role: "ADMIN",
  status,
});
const editor = (id: string): AdminGuardUser => ({ id, role: "EDITOR", status: "ACTIVE" });

describe("isLastActiveAdmin", () => {
  it("blocks demoting the only active admin", () => {
    const users = [admin("a"), editor("b")];
    expect(isLastActiveAdmin(users, "a", { role: "EDITOR" })).toBe(true);
  });

  it("blocks suspending the only active admin", () => {
    const users = [admin("a"), editor("b")];
    expect(isLastActiveAdmin(users, "a", { status: "SUSPENDED" })).toBe(true);
  });

  it("allows demoting one admin when another active admin remains", () => {
    const users = [admin("a"), admin("b")];
    expect(isLastActiveAdmin(users, "a", { role: "EDITOR" })).toBe(false);
  });

  it("allows suspending one admin when another active admin remains", () => {
    const users = [admin("a"), admin("b")];
    expect(isLastActiveAdmin(users, "a", { status: "SUSPENDED" })).toBe(false);
  });

  it("does not count a SUSPENDED admin as a remaining active admin", () => {
    const users = [admin("a"), admin("b", "SUSPENDED")];
    expect(isLastActiveAdmin(users, "a", { role: "VIEWER" })).toBe(true);
  });

  it("treats a no-op (still active admin) as allowed", () => {
    const users = [admin("a")];
    expect(isLastActiveAdmin(users, "a", { role: "ADMIN", status: "ACTIVE" })).toBe(false);
    expect(isLastActiveAdmin(users, "a", {})).toBe(false);
  });

  it("ignores changes to non-admin targets", () => {
    const users = [admin("a"), editor("b")];
    expect(isLastActiveAdmin(users, "b", { status: "SUSPENDED" })).toBe(false);
  });

  it("returns false for an unknown target id", () => {
    const users = [admin("a")];
    expect(isLastActiveAdmin(users, "ghost", { status: "SUSPENDED" })).toBe(false);
  });

  it("does not block when the target admin is already suspended", () => {
    // Already-suspended admin can't cause new lockout; another active admin may not exist.
    const users = [admin("a", "SUSPENDED")];
    expect(isLastActiveAdmin(users, "a", { role: "VIEWER" })).toBe(false);
  });
});

describe("isInviteValid", () => {
  const now = new Date("2026-06-22T12:00:00.000Z");

  it("is valid when expiry is in the future", () => {
    expect(isInviteValid(new Date(now.getTime() + 1000), now)).toBe(true);
  });

  it("is invalid when expiry is in the past", () => {
    expect(isInviteValid(new Date(now.getTime() - 1000), now)).toBe(false);
  });

  it("is invalid exactly at expiry (strict greater-than)", () => {
    expect(isInviteValid(new Date(now.getTime()), now)).toBe(false);
  });

  it("is invalid for null / undefined / empty", () => {
    expect(isInviteValid(null, now)).toBe(false);
    expect(isInviteValid(undefined, now)).toBe(false);
    expect(isInviteValid("", now)).toBe(false);
  });

  it("is invalid for a malformed date string", () => {
    expect(isInviteValid("not-a-date", now)).toBe(false);
  });

  it("accepts an ISO string expiry", () => {
    expect(isInviteValid(new Date(now.getTime() + 5000).toISOString(), now)).toBe(true);
  });
});

describe("inviteExpiry", () => {
  it("is 7 days after the given start", () => {
    const from = new Date("2026-06-22T00:00:00.000Z");
    expect(inviteExpiry(from).getTime() - from.getTime()).toBe(INVITE_TTL_MS);
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("authorSlugSeed", () => {
  it("derives a slug from a name", () => {
    expect(authorSlugSeed("Ada Lovelace")).toBe("ada-lovelace");
  });

  it("uses the local part of an email", () => {
    expect(authorSlugSeed("ada.lovelace@example.com")).toBe("ada-lovelace");
  });

  it("strips diacritics and collapses separators", () => {
    expect(authorSlugSeed("Renée  Élan!!")).toBe("renee-elan");
  });

  it("falls back to 'author' for symbol-only input", () => {
    expect(authorSlugSeed("@@@")).toBe("author");
    expect(authorSlugSeed("")).toBe("author");
  });
});
