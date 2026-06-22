/**
 * Unit tests for validateJsonLd (NFR-SEO-01).
 *
 * Covers a valid object per recognized @type plus each missing-required-field
 * case, and the structural guards (@context / @type / non-object input).
 */

import { describe, it, expect } from "vitest";
import { validateJsonLd } from "../validate";

const CONTEXT = "https://schema.org";

describe("validateJsonLd — structural guards", () => {
  it("rejects non-object input", () => {
    for (const bad of [null, undefined, 42, "x", [1, 2]]) {
      const r = validateJsonLd(bad);
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects a missing @context", () => {
    const r = validateJsonLd({ "@type": "Article", headline: "x" });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("@context"))).toBe(true);
  });

  it("rejects a @context that is not schema.org", () => {
    const r = validateJsonLd({ "@context": "https://example.com", "@type": "Article", headline: "x" });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("schema.org"))).toBe(true);
  });

  it("accepts schema.org with a trailing slash", () => {
    const r = validateJsonLd({ "@context": "https://schema.org/", "@type": "Article", headline: "x" });
    expect(r.valid).toBe(true);
  });

  it("rejects a missing @type and skips field checks", () => {
    const r = validateJsonLd({ "@context": CONTEXT });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("@type"))).toBe(true);
  });
});

describe("validateJsonLd — Article", () => {
  it("valid with headline", () => {
    expect(validateJsonLd({ "@context": CONTEXT, "@type": "Article", headline: "Hi" }).valid).toBe(true);
  });
  it("invalid without headline", () => {
    const r = validateJsonLd({ "@context": CONTEXT, "@type": "Article" });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("headline"))).toBe(true);
  });
});

describe("validateJsonLd — BlogPosting", () => {
  it("valid with headline + datePublished", () => {
    const r = validateJsonLd({
      "@context": CONTEXT,
      "@type": "BlogPosting",
      headline: "Hi",
      datePublished: "2026-01-01T00:00:00.000Z",
    });
    expect(r.valid).toBe(true);
  });
  it("invalid without headline", () => {
    const r = validateJsonLd({ "@context": CONTEXT, "@type": "BlogPosting", datePublished: "2026-01-01" });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("headline"))).toBe(true);
  });
  it("invalid without datePublished", () => {
    const r = validateJsonLd({ "@context": CONTEXT, "@type": "BlogPosting", headline: "Hi" });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("datePublished"))).toBe(true);
  });
});

describe("validateJsonLd — NewsArticle", () => {
  it("valid with headline + datePublished", () => {
    const r = validateJsonLd({
      "@context": CONTEXT,
      "@type": "NewsArticle",
      headline: "Hi",
      datePublished: "2026-01-01",
    });
    expect(r.valid).toBe(true);
  });
  it("invalid when both required fields missing", () => {
    const r = validateJsonLd({ "@context": CONTEXT, "@type": "NewsArticle" });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBe(2);
  });
});

describe("validateJsonLd — Event (Webinar)", () => {
  it("valid with startDate", () => {
    const r = validateJsonLd({ "@context": CONTEXT, "@type": "Event", startDate: "2026-02-01T10:00:00Z" });
    expect(r.valid).toBe(true);
  });
  it("invalid without startDate", () => {
    const r = validateJsonLd({ "@context": CONTEXT, "@type": "Event", name: "Webinar" });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("startDate"))).toBe(true);
  });
});

describe("validateJsonLd — FAQPage", () => {
  it("valid with non-empty mainEntity", () => {
    const r = validateJsonLd({
      "@context": CONTEXT,
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Q", acceptedAnswer: { "@type": "Answer", text: "A" } }],
    });
    expect(r.valid).toBe(true);
  });
  it("invalid with an empty mainEntity array", () => {
    const r = validateJsonLd({ "@context": CONTEXT, "@type": "FAQPage", mainEntity: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("mainEntity"))).toBe(true);
  });
  it("invalid without mainEntity", () => {
    const r = validateJsonLd({ "@context": CONTEXT, "@type": "FAQPage" });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("mainEntity"))).toBe(true);
  });
});

describe("validateJsonLd — unrecognized @type", () => {
  it("passes structural checks without per-type field requirements", () => {
    const r = validateJsonLd({ "@context": CONTEXT, "@type": "Recipe" });
    expect(r.valid).toBe(true);
  });
});
