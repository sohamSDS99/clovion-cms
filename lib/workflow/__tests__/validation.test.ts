import { describe, expect, it } from "vitest";
import {
  validateForPublish,
  type PublishCandidate,
} from "@/lib/workflow/validation";
import type { ContentType } from "@/lib/workflow/types";

const GOOD_DESC = "x".repeat(80); // within [50,160]

function base(overrides: Partial<PublishCandidate> = {}): PublishCandidate {
  return {
    type: "NEWS",
    title: "A valid title",
    slug: "a-valid-slug",
    slugUniqueInType: true,
    seo: { metaTitle: "Good Meta Title", metaDescription: GOOD_DESC },
    coverAssetId: "asset_1",
    typeData: {},
    ...overrides,
  };
}

function fields(errors: { field: string }[]): string[] {
  return errors.map((e) => e.field);
}

describe("validateForPublish — passing cases per type", () => {
  it("NEWS passes with all required fields", () => {
    const res = validateForPublish(base({ type: "NEWS" }));
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("BLOG passes with cover", () => {
    const res = validateForPublish(base({ type: "BLOG", coverAssetId: "asset_1" }));
    expect(res.ok).toBe(true);
  });

  it("RESOURCE passes with pdfAssetId", () => {
    const res = validateForPublish(
      base({ type: "RESOURCE", typeData: { pdfAssetId: "pdf_1" } })
    );
    expect(res.ok).toBe(true);
  });

  it("RESEARCH publishes as an article — no PDF required", () => {
    // A text/body research report has no file; it must still publish.
    const res = validateForPublish(base({ type: "RESEARCH", typeData: {} }));
    expect(res.ok).toBe(true);
    expect(fields(res.errors)).not.toContain("typeData.pdfAssetId");
  });

  it("RESEARCH still publishes with an optional file attached", () => {
    const res = validateForPublish(
      base({ type: "RESEARCH", typeData: { pdfAssetId: "pdf_1" } })
    );
    expect(res.ok).toBe(true);
  });

  it("WEBINAR passes with startAt + registrationUrl", () => {
    const res = validateForPublish(
      base({
        type: "WEBINAR",
        typeData: { startAt: "2026-07-01T10:00:00Z", registrationUrl: "https://x" },
      })
    );
    expect(res.ok).toBe(true);
  });

  it("FAQ publishes as an article — no faqItems required", () => {
    const res = validateForPublish(base({ type: "FAQ", typeData: {} }));
    expect(res.ok).toBe(true);
    expect(fields(res.errors)).not.toContain("typeData.faqItems");
  });
});

describe("validateForPublish — title & slug", () => {
  it("flags empty title", () => {
    const res = validateForPublish(base({ title: "   " }));
    expect(res.ok).toBe(false);
    expect(fields(res.errors)).toContain("title");
  });

  it("flags empty slug", () => {
    const res = validateForPublish(base({ slug: "" }));
    expect(fields(res.errors)).toContain("slug");
  });

  it("flags non-unique slug", () => {
    const res = validateForPublish(base({ slugUniqueInType: false }));
    expect(fields(res.errors)).toContain("slug");
  });
});

describe("validateForPublish — SEO meta", () => {
  it("flags missing metaTitle", () => {
    const res = validateForPublish(base({ seo: { metaDescription: GOOD_DESC } }));
    expect(fields(res.errors)).toContain("seo.metaTitle");
  });

  it("flags metaTitle longer than 60", () => {
    const res = validateForPublish(
      base({ seo: { metaTitle: "x".repeat(61), metaDescription: GOOD_DESC } })
    );
    expect(fields(res.errors)).toContain("seo.metaTitle");
  });

  it("accepts metaTitle exactly 60", () => {
    const res = validateForPublish(
      base({ seo: { metaTitle: "x".repeat(60), metaDescription: GOOD_DESC } })
    );
    expect(fields(res.errors)).not.toContain("seo.metaTitle");
  });

  it("flags metaDescription shorter than 50", () => {
    const res = validateForPublish(
      base({ seo: { metaTitle: "T", metaDescription: "x".repeat(49) } })
    );
    expect(fields(res.errors)).toContain("seo.metaDescription");
  });

  it("flags metaDescription longer than 160", () => {
    const res = validateForPublish(
      base({ seo: { metaTitle: "T", metaDescription: "x".repeat(161) } })
    );
    expect(fields(res.errors)).toContain("seo.metaDescription");
  });

  it("accepts metaDescription boundary lengths 50 and 160", () => {
    expect(
      validateForPublish(base({ seo: { metaTitle: "T", metaDescription: "x".repeat(50) } })).ok
    ).toBe(true);
    expect(
      validateForPublish(base({ seo: { metaTitle: "T", metaDescription: "x".repeat(160) } })).ok
    ).toBe(true);
  });
});

describe("validateForPublish — cover image (warning for every type)", () => {
  it.each(["BLOG", "RESEARCH", "NEWS", "WEBINAR", "RESOURCE", "FAQ"] as ContentType[])(
    "%s without cover is only a warning",
    (type) => {
      const typeData =
        type === "RESOURCE"
          ? { pdfAssetId: "p" }
          : type === "WEBINAR"
            ? { startAt: "t", registrationUrl: "u" }
            : {};
      const res = validateForPublish(base({ type, coverAssetId: null, typeData }));
      expect(fields(res.warnings)).toContain("coverAssetId");
      expect(fields(res.errors)).not.toContain("coverAssetId");
      expect(res.ok).toBe(true);
    }
  );
});

describe("validateForPublish — type-specific requirements", () => {
  it("RESOURCE missing pdfAssetId is an error", () => {
    const res = validateForPublish(base({ type: "RESOURCE", typeData: {} }));
    expect(res.ok).toBe(false);
    expect(fields(res.errors)).toContain("typeData.pdfAssetId");
  });

  it("WEBINAR missing startAt and registrationUrl produces both errors", () => {
    const res = validateForPublish(base({ type: "WEBINAR", typeData: {} }));
    expect(fields(res.errors)).toContain("typeData.startAt");
    expect(fields(res.errors)).toContain("typeData.registrationUrl");
  });

  it("WEBINAR missing only registrationUrl", () => {
    const res = validateForPublish(
      base({ type: "WEBINAR", typeData: { startAt: "t" } })
    );
    expect(fields(res.errors)).toContain("typeData.registrationUrl");
    expect(fields(res.errors)).not.toContain("typeData.startAt");
  });

  it("FAQ empty faqItems is not an error (article-shaped, body is the content)", () => {
    const res = validateForPublish(base({ type: "FAQ", typeData: { faqItems: [] } }));
    expect(fields(res.errors)).not.toContain("typeData.faqItems");
    expect(res.ok).toBe(true);
  });
});

describe("validateForPublish — ok reflects errors only (warnings don't block)", () => {
  it("ok stays true with only warnings", () => {
    const res = validateForPublish(base({ type: "NEWS", coverAssetId: null }));
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.ok).toBe(true);
  });
});

describe("validateForPublish — COURSE", () => {
  const courseData = {
    courseSlug: "chemical-safety-101",
    courseTitle: "Chemical Safety 101",
    lessonNumber: 2,
  };

  it("passes with courseSlug, courseTitle and lessonNumber", () => {
    const res = validateForPublish(base({ type: "COURSE", typeData: courseData }));
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("fails without courseSlug", () => {
    const { courseSlug: _omit, ...rest } = courseData;
    const res = validateForPublish(base({ type: "COURSE", typeData: rest }));
    expect(res.ok).toBe(false);
    expect(fields(res.errors)).toContain("typeData.courseSlug");
  });

  it("fails without courseTitle", () => {
    const { courseTitle: _omit, ...rest } = courseData;
    const res = validateForPublish(base({ type: "COURSE", typeData: rest }));
    expect(res.ok).toBe(false);
    expect(fields(res.errors)).toContain("typeData.courseTitle");
  });

  it("fails without lessonNumber", () => {
    const { lessonNumber: _omit, ...rest } = courseData;
    const res = validateForPublish(base({ type: "COURSE", typeData: rest }));
    expect(res.ok).toBe(false);
    expect(fields(res.errors)).toContain("typeData.lessonNumber");
  });

  it("reports all three grouping fields on empty typeData", () => {
    const res = validateForPublish(base({ type: "COURSE", typeData: {} }));
    expect(res.ok).toBe(false);
    const f = fields(res.errors);
    expect(f).toContain("typeData.courseSlug");
    expect(f).toContain("typeData.courseTitle");
    expect(f).toContain("typeData.lessonNumber");
  });
});
