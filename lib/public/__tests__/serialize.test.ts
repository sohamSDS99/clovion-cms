/**
 * Public serializer — author byline + avatar resolution.
 *
 * Regression guard: the avatar URL is resolved by the query layer (the avatar is
 * an FK-less asset reference) and threaded into the pure serializer. A prior bug
 * hardcoded `null`, so avatars never reached the website. These tests lock in:
 *   - a public author's avatar/title/socials flow through,
 *   - a private (isPublic=false) author is never exposed,
 *   - the avatar is null when the query layer resolved nothing.
 */
import { describe, expect, it } from "vitest";
import type { AuthorProfile } from "@prisma/client";
import {
  toPublicContent,
  toPublicSummary,
  type ContentItemWithRelations,
} from "../serialize";

function author(overrides: Partial<AuthorProfile> = {}): AuthorProfile {
  return {
    id: "a1",
    displayName: "Jawad Monzur",
    slug: "jawad-monzur",
    title: "EHS Expert",
    bio: "Fifteen years in workplace safety.",
    avatarAssetId: "asset-1",
    socialLinks: { linkedin: "https://www.linkedin.com/in/jawad-monzur/" },
    isPublic: true,
    isGhost: false,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    createdById: null,
    updatedById: null,
    ...overrides,
  } as AuthorProfile;
}

function item(profile: AuthorProfile | null): ContentItemWithRelations {
  return {
    id: "c1",
    type: "BLOG",
    title: "A post",
    slug: "a-post",
    excerpt: "excerpt",
    bodyHtml: "<p>body</p>",
    body: {},
    seo: {},
    typeData: {},
    status: "PUBLISHED",
    publishedAt: new Date("2026-02-01"),
    updatedAt: new Date("2026-02-02"),
    authorProfile: profile,
    category: null,
    coverAsset: null,
    tags: [],
  } as unknown as ContentItemWithRelations;
}

describe("toPublicSummary author byline", () => {
  it("exposes a public author with the resolved avatar URL, title and socials", () => {
    const out = toPublicSummary(item(author()), "https://cdn.example/av.webp");
    expect(out.author).not.toBeNull();
    expect(out.author?.displayName).toBe("Jawad Monzur");
    expect(out.author?.title).toBe("EHS Expert");
    expect(out.author?.avatar).toBe("https://cdn.example/av.webp");
    expect(out.author?.socials.linkedin).toBe(
      "https://www.linkedin.com/in/jawad-monzur/",
    );
    expect(out.author?.bio).toBe("Fifteen years in workplace safety.");
  });

  it("never exposes a private (isPublic=false) author", () => {
    const out = toPublicSummary(item(author({ isPublic: false })), "https://cdn/av.webp");
    expect(out.author).toBeNull();
  });

  it("yields a null avatar when the query layer resolved none", () => {
    const out = toPublicSummary(item(author()));
    expect(out.author).not.toBeNull();
    expect(out.author?.avatar).toBeNull();
  });

  it("has no author byline when the item has no profile", () => {
    const out = toPublicSummary(item(null));
    expect(out.author).toBeNull();
  });
});

// The resource file is stored as `typeData.pdfAssetId`; the query layer resolves
// it to a public URL and threads it into the serializer. Regression guard: an
// ungated resource must expose that URL, and a gated one must NEVER leak it
// (NFR-SEC-03), even when a URL is resolved and passed in.
describe("toPublicContent resource download URL", () => {
  function resource(typeData: Record<string, unknown>): ContentItemWithRelations {
    return { ...item(null), type: "RESOURCE", typeData } as ContentItemWithRelations;
  }
  const url = "https://cdn.example/report.pdf";

  it("exposes the resolved download URL for an ungated resource", () => {
    const out = toPublicContent(resource({ pdfAssetId: "a1" }), null, url);
    expect(out.typeData.downloadUrl).toBe(url);
  });

  it("never leaks the download URL for a gated resource", () => {
    const out = toPublicContent(
      resource({ pdfAssetId: "a1", gated: true, leadFormId: "lf1" }),
      null,
      url,
    );
    expect(out.typeData.downloadUrl).toBeUndefined();
  });
});
