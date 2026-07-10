/**
 * Avatar resolution for the public layer (the bug that hid author photos).
 *
 * `AuthorProfile.avatarAssetId` is an FK-less column, so the URL must be resolved
 * with a manual MediaAsset lookup and threaded into the serializer. These tests
 * exercise that exact path with a mocked Prisma: thumb-variant preference, plain
 * fallback, batching/dedup, skipping missing assets, and mapping a content item.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/db/prisma", () => ({
  prisma: { mediaAsset: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

import {
  resolveAvatarUrls,
  resolveAvatarUrl,
  avatarUrlFor,
} from "../query";
import type { ContentItemWithRelations } from "../serialize";

beforeEach(() => findMany.mockReset());

describe("resolveAvatarUrls", () => {
  it("prefers the thumb variant, falls back to the original url", async () => {
    findMany.mockResolvedValue([
      { id: "a", url: "https://cdn/a.png", variants: { thumb: "https://cdn/a.thumb.webp" } },
      { id: "b", url: "https://cdn/b.png", variants: {} },
    ]);
    const map = await resolveAvatarUrls(["a", "b"]);
    expect(map.get("a")).toBe("https://cdn/a.thumb.webp");
    expect(map.get("b")).toBe("https://cdn/b.png");
  });

  it("dedups ids and drops null/undefined without a query when empty", async () => {
    const empty = await resolveAvatarUrls([null, undefined]);
    expect(empty.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();

    findMany.mockResolvedValue([{ id: "a", url: "u", variants: {} }]);
    await resolveAvatarUrls(["a", "a", null]);
    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.id.in).toEqual(["a"]); // deduped
    expect(arg.where.deletedAt).toBeNull(); // soft-deleted excluded
  });

  it("omits ids with no matching (or soft-deleted) asset", async () => {
    findMany.mockResolvedValue([]); // nothing found
    const map = await resolveAvatarUrls(["missing"]);
    expect(map.has("missing")).toBe(false);
  });
});

describe("resolveAvatarUrl (single)", () => {
  it("returns null for a null id without querying", async () => {
    expect(await resolveAvatarUrl(null)).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });
  it("returns the resolved url for a present asset", async () => {
    findMany.mockResolvedValue([{ id: "x", url: "https://cdn/x.png", variants: {} }]);
    expect(await resolveAvatarUrl("x")).toBe("https://cdn/x.png");
  });
});

describe("avatarUrlFor", () => {
  const map = new Map([["a", "https://cdn/a.webp"]]);
  const withAsset = { authorProfile: { avatarAssetId: "a" } } as unknown as ContentItemWithRelations;
  const noAsset = { authorProfile: { avatarAssetId: null } } as unknown as ContentItemWithRelations;
  const noProfile = { authorProfile: null } as unknown as ContentItemWithRelations;

  it("maps an item's author avatar id to its url", () => {
    expect(avatarUrlFor(withAsset, map)).toBe("https://cdn/a.webp");
  });
  it("returns null when there is no avatar or no profile", () => {
    expect(avatarUrlFor(noAsset, map)).toBeNull();
    expect(avatarUrlFor(noProfile, map)).toBeNull();
  });
});
