/**
 * Pure unit tests for the content zod schemas (no DB).
 * Covers create/update/transition + per-type typeData accept/reject.
 */
import { describe, it, expect } from "vitest";
import {
  courseTypeDataSchema,
  createContentSchema,
  updateContentSchema,
  transitionSchema,
  listContentQuerySchema,
} from "@/lib/content/schemas";

describe("createContentSchema", () => {
  it("accepts a minimal valid BLOG", () => {
    const r = createContentSchema.safeParse({ type: "BLOG", title: "My Post" });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown type", () => {
    const r = createContentSchema.safeParse({ type: "PODCAST", title: "X" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty title", () => {
    const r = createContentSchema.safeParse({ type: "BLOG", title: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a non-kebab slug", () => {
    const r = createContentSchema.safeParse({
      type: "BLOG",
      title: "X",
      slug: "Not A Slug",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid kebab slug", () => {
    const r = createContentSchema.safeParse({
      type: "BLOG",
      title: "X",
      slug: "valid-slug-123",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-uuid categoryId", () => {
    const r = createContentSchema.safeParse({
      type: "BLOG",
      title: "X",
      categoryId: "not-a-uuid",
    });
    expect(r.success).toBe(false);
  });

  // ── Per-type typeData refinements ───────────────────────────────────────────

  it("accepts WEBINAR with valid typeData", () => {
    const r = createContentSchema.safeParse({
      type: "WEBINAR",
      title: "Live Demo",
      typeData: {
        startAt: "2026-07-01T15:00:00.000Z",
        registrationUrl: "https://example.com/register",
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects WEBINAR with a bad startAt datetime", () => {
    const r = createContentSchema.safeParse({
      type: "WEBINAR",
      title: "Live Demo",
      typeData: { startAt: "not-a-date" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects WEBINAR with a non-url registrationUrl", () => {
    const r = createContentSchema.safeParse({
      type: "WEBINAR",
      title: "Live Demo",
      typeData: { registrationUrl: "ftp not a url" },
    });
    expect(r.success).toBe(false);
  });

  it("accepts RESOURCE with valid typeData", () => {
    const r = createContentSchema.safeParse({
      type: "RESOURCE",
      title: "Guide",
      typeData: {
        resourceKind: "EBOOK",
        gated: true,
        pdfAssetId: "11111111-1111-1111-1111-111111111111",
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects RESOURCE with an invalid resourceKind", () => {
    const r = createContentSchema.safeParse({
      type: "RESOURCE",
      title: "Guide",
      typeData: { resourceKind: "MOVIE" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects RESOURCE with a non-uuid pdfAssetId", () => {
    const r = createContentSchema.safeParse({
      type: "RESOURCE",
      title: "Guide",
      typeData: { pdfAssetId: "nope" },
    });
    expect(r.success).toBe(false);
  });

  it("accepts FAQ with faqItems", () => {
    const r = createContentSchema.safeParse({
      type: "FAQ",
      title: "Help",
      typeData: { faqItems: [{ question: "Q?", answer: "A." }] },
    });
    expect(r.success).toBe(true);
  });

  it("rejects FAQ with a malformed faqItem", () => {
    const r = createContentSchema.safeParse({
      type: "FAQ",
      title: "Help",
      typeData: { faqItems: [{ question: "Q?" }] },
    });
    expect(r.success).toBe(false);
  });

  it("accepts NEWS with sourceUrl + dateline", () => {
    const r = createContentSchema.safeParse({
      type: "NEWS",
      title: "Breaking",
      typeData: { sourceUrl: "https://example.com/article", dateline: "NYC" },
    });
    expect(r.success).toBe(true);
  });

  it("rejects NEWS with a bad sourceUrl", () => {
    const r = createContentSchema.safeParse({
      type: "NEWS",
      title: "Breaking",
      typeData: { sourceUrl: "not a url" },
    });
    expect(r.success).toBe(false);
  });
});

describe("updateContentSchema", () => {
  it("leaves source optional (default applied server-side)", () => {
    const r = updateContentSchema.safeParse({ title: "New" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.source).toBeUndefined();
  });

  it("accepts source 'autosave'", () => {
    const r = updateContentSchema.safeParse({ source: "autosave", body: { type: "doc" } });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown source value", () => {
    const r = updateContentSchema.safeParse({ source: "background" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const r = updateContentSchema.safeParse({ title: "X", bogus: 1 });
    expect(r.success).toBe(false);
  });

  it("accepts an empty partial update", () => {
    const r = updateContentSchema.safeParse({});
    expect(r.success).toBe(true);
  });
});

describe("transitionSchema", () => {
  it("accepts a simple action", () => {
    const r = transitionSchema.safeParse({ action: "submit" });
    expect(r.success).toBe(true);
  });

  it("requires scheduledAt for schedule", () => {
    const r = transitionSchema.safeParse({ action: "schedule" });
    expect(r.success).toBe(false);
  });

  it("accepts schedule with a valid ISO scheduledAt", () => {
    const r = transitionSchema.safeParse({
      action: "schedule",
      scheduledAt: "2026-12-01T10:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown action", () => {
    const r = transitionSchema.safeParse({ action: "explode" });
    expect(r.success).toBe(false);
  });

  it("rejects a non-ISO scheduledAt", () => {
    const r = transitionSchema.safeParse({ action: "schedule", scheduledAt: "soon" });
    expect(r.success).toBe(false);
  });
});

describe("listContentQuerySchema", () => {
  it("coerces limit and applies defaults", () => {
    const r = listContentQuerySchema.safeParse({ limit: "30" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(30);
  });

  it("leaves limit optional when absent (default applied server-side)", () => {
    const r = listContentQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBeUndefined();
  });

  it("rejects an out-of-range limit", () => {
    const r = listContentQuerySchema.safeParse({ limit: "9999" });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid status", () => {
    const r = listContentQuerySchema.safeParse({ status: "LIVE" });
    expect(r.success).toBe(false);
  });
});

// ── COURSE typeData ───────────────────────────────────────────────────────────

describe("courseTypeDataSchema", () => {
  const UUID = "8f14e45f-ea0e-4bfd-9a29-8f6a304c19dd";
  const valid = {
    courseSlug: "chemical-safety-101",
    courseTitle: "Chemical Safety 101",
    lessonNumber: 3,
  };

  it("accepts the minimal required fields", () => {
    expect(courseTypeDataSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional keyLearnings and downloads", () => {
    const r = courseTypeDataSchema.safeParse({
      ...valid,
      keyLearnings: ["Read GHS labels", "Store acids apart"],
      downloads: [{ mediaAssetId: UUID, label: "Worksheet" }],
    });
    expect(r.success).toBe(true);
  });

  it("flows through createContentSchema for type COURSE", () => {
    const r = createContentSchema.safeParse({
      type: "COURSE",
      title: "Lesson 3",
      typeData: valid,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-kebab courseSlug", () => {
    const r = courseTypeDataSchema.safeParse({ ...valid, courseSlug: "Not A Slug" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing courseTitle", () => {
    const { courseTitle: _omit, ...rest } = valid;
    expect(courseTypeDataSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects lessonNumber below 1", () => {
    const r = courseTypeDataSchema.safeParse({ ...valid, lessonNumber: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects lessonNumber above 50", () => {
    const r = courseTypeDataSchema.safeParse({ ...valid, lessonNumber: 51 });
    expect(r.success).toBe(false);
  });

  it("rejects a non-integer lessonNumber", () => {
    const r = courseTypeDataSchema.safeParse({ ...valid, lessonNumber: 2.5 });
    expect(r.success).toBe(false);
  });

  it("rejects a download without a label", () => {
    const r = courseTypeDataSchema.safeParse({
      ...valid,
      downloads: [{ mediaAssetId: UUID }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a download with a non-uuid mediaAssetId", () => {
    const r = courseTypeDataSchema.safeParse({
      ...valid,
      downloads: [{ mediaAssetId: "not-a-uuid", label: "Worksheet" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects more than 6 downloads", () => {
    const r = courseTypeDataSchema.safeParse({
      ...valid,
      downloads: Array.from({ length: 7 }, (_, i) => ({
        mediaAssetId: UUID,
        label: `File ${i + 1}`,
      })),
    });
    expect(r.success).toBe(false);
  });

  it("rejects more than 8 keyLearnings", () => {
    const r = courseTypeDataSchema.safeParse({
      ...valid,
      keyLearnings: Array.from({ length: 9 }, (_, i) => `Learning ${i + 1}`),
    });
    expect(r.success).toBe(false);
  });
});
