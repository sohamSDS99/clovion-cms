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

// Covers expose responsive variants + intrinsic dimensions so the website can
// pick the right-sized image and decide cover-vs-contain from the aspect ratio.
describe("cover image", () => {
  function withCover(cover: unknown): ContentItemWithRelations {
    return { ...item(null), coverAsset: cover } as ContentItemWithRelations;
  }

  it("projects url, variants and dimensions", () => {
    const out = toPublicSummary(
      withCover({
        url: "https://cdn/cover.png",
        variants: { thumb: "https://cdn/cover.thumb.webp", md: "https://cdn/cover.md.webp" },
        width: 1600,
        height: 900,
      }),
    );
    expect(out.coverImageUrl).toBe("https://cdn/cover.png"); // backward-compat
    expect(out.coverImage).toEqual({
      url: "https://cdn/cover.png",
      thumb: "https://cdn/cover.thumb.webp",
      md: "https://cdn/cover.md.webp",
      lg: null,
      width: 1600,
      height: 900,
    });
  });

  it("is null when there is no cover asset", () => {
    const out = toPublicSummary(withCover(null));
    expect(out.coverImageUrl).toBeNull();
    expect(out.coverImage).toBeNull();
  });
});

// OG share image: the query layer resolves seo.ogImageAssetId → URL and threads
// it in. It wins over any literal seo.ogImage and over the cover fallback; with
// nothing resolved, seo.ogImage falls back to the cover image so a shared page
// always has a social card.
describe("og share image", () => {
  const cover = { url: "https://cdn/cover.png", variants: {}, width: 1, height: 1 };

  it("uses the resolved og image URL when provided", () => {
    const out = toPublicContent(
      { ...item(null), coverAsset: cover } as ContentItemWithRelations,
      null,
      null,
      "https://cdn/og.webp",
    );
    expect(out.seo.ogImage).toBe("https://cdn/og.webp");
  });

  it("falls back to the cover image when no og image is set", () => {
    const out = toPublicContent(
      { ...item(null), coverAsset: cover } as ContentItemWithRelations,
      null,
      null,
      null,
    );
    expect(out.seo.ogImage).toBe("https://cdn/cover.png");
  });

  it("is undefined when neither an og image nor a cover exists", () => {
    const out = toPublicContent(item(null), null, null, null);
    expect(out.seo.ogImage).toBeUndefined();
  });
});

// ── COURSE typeData serialization ─────────────────────────────────────────────

describe("toPublicContent COURSE typeData", () => {
  function courseItem(typeData: Record<string, unknown>): ContentItemWithRelations {
    return {
      id: "c2",
      type: "COURSE",
      title: "Lesson 2",
      slug: "storage",
      excerpt: "excerpt",
      bodyHtml: "<p>body</p>",
      body: {},
      seo: {},
      typeData,
      status: "PUBLISHED",
      publishedAt: new Date("2026-02-01"),
      updatedAt: new Date("2026-02-02"),
      authorProfile: null,
      category: null,
      coverAsset: null,
      tags: [],
    } as unknown as ContentItemWithRelations;
  }

  const td = {
    courseSlug: "chemical-safety-101",
    courseTitle: "Chemical Safety 101",
    lessonNumber: 2,
    keyLearnings: ["Store acids apart"],
    downloads: [
      { mediaAssetId: "8f14e45f-ea0e-4bfd-9a29-8f6a304c19dd", label: "Worksheet" },
    ],
  };

  it("emits resolved downloads and never a raw mediaAssetId", () => {
    const out = toPublicContent(courseItem(td), null, null, null, [
      { label: "Worksheet", url: "https://cdn.example/w.docx", filename: "w.docx" },
    ]);
    expect(out.typeData.courseSlug).toBe("chemical-safety-101");
    expect(out.typeData.courseTitle).toBe("Chemical Safety 101");
    expect(out.typeData.lessonNumber).toBe(2);
    expect(out.typeData.keyLearnings).toEqual(["Store acids apart"]);
    expect(out.typeData.downloads).toEqual([
      { label: "Worksheet", url: "https://cdn.example/w.docx", filename: "w.docx" },
    ]);
    // The internal asset reference must never leave the building.
    expect(JSON.stringify(out.typeData)).not.toContain("mediaAssetId");
  });

  it("defaults keyLearnings/downloads to empty arrays when unresolved", () => {
    const out = toPublicContent(
      courseItem({ courseSlug: "c", courseTitle: "C", lessonNumber: 1 }),
    );
    expect(out.typeData.keyLearnings).toEqual([]);
    expect(out.typeData.downloads).toEqual([]);
  });
});
