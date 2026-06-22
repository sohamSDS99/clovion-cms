import { describe, it, expect } from "vitest";
import {
  sopsToDeactivate,
  appliesToOverlaps,
  type SopOverlapCandidate,
} from "@/lib/sop/logic";
import { createSopSchema, updateSopSchema } from "@/lib/sop/schemas";

describe("sopsToDeactivate (one-active-per-type invariant)", () => {
  const others: SopOverlapCandidate[] = [
    { id: "blog-sop", appliesTo: ["BLOG"] },
    { id: "news-resource-sop", appliesTo: ["NEWS", "RESOURCE"] },
    { id: "faq-sop", appliesTo: ["FAQ"] },
  ];

  it("deactivates other active SOPs touching BLOG or NEWS, leaves FAQ-only alone", () => {
    const result = sopsToDeactivate(["BLOG", "NEWS"], others);
    expect(result).toContain("blog-sop");
    expect(result).toContain("news-resource-sop"); // overlaps on NEWS
    expect(result).not.toContain("faq-sop");
    expect(result).toHaveLength(2);
  });

  it("returns empty when no other SOP overlaps", () => {
    expect(sopsToDeactivate(["WEBINAR"], others)).toEqual([]);
  });

  it("deactivates a multi-type SOP when it overlaps on a single type", () => {
    expect(sopsToDeactivate(["RESOURCE"], others)).toEqual(["news-resource-sop"]);
  });

  it("handles empty other-SOP list", () => {
    expect(sopsToDeactivate(["BLOG", "FAQ"], [])).toEqual([]);
  });
});

describe("appliesToOverlaps", () => {
  it("detects overlap and non-overlap", () => {
    expect(appliesToOverlaps(["BLOG", "NEWS"], ["NEWS"])).toBe(true);
    expect(appliesToOverlaps(["BLOG"], ["FAQ"])).toBe(false);
    expect(appliesToOverlaps([], ["BLOG"])).toBe(false);
  });
});

describe("createSopSchema", () => {
  it("accepts a valid SOP", () => {
    const parsed = createSopSchema.parse({
      name: "House style",
      body: "Write clearly.",
      appliesTo: ["BLOG", "NEWS"],
    });
    expect(parsed.appliesTo).toEqual(["BLOG", "NEWS"]);
  });

  it("rejects empty appliesTo", () => {
    expect(
      createSopSchema.safeParse({ name: "x", body: "y", appliesTo: [] }).success
    ).toBe(false);
  });

  it("rejects unknown content type", () => {
    expect(
      createSopSchema.safeParse({ name: "x", body: "y", appliesTo: ["PODCAST"] })
        .success
    ).toBe(false);
  });

  it("rejects missing name/body", () => {
    expect(
      createSopSchema.safeParse({ name: "", body: "", appliesTo: ["BLOG"] })
        .success
    ).toBe(false);
  });
});

describe("updateSopSchema", () => {
  it("accepts a single-field partial update", () => {
    expect(updateSopSchema.safeParse({ name: "New name" }).success).toBe(true);
  });

  it("rejects an empty update object", () => {
    expect(updateSopSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid appliesTo when present", () => {
    expect(updateSopSchema.safeParse({ appliesTo: [] }).success).toBe(false);
  });
});
