/**
 * Pure unit tests for generateJsonLd (NFR-SEO-01).
 *
 * No Prisma / no I/O — exercises the schema.org mapping for each ContentType and
 * the gated-resource URL-omission rule (NFR-SEC-03 / NG3).
 */

import { describe, it, expect } from "vitest";
import { generateJsonLd, type JsonLdInput } from "../jsonld";

const base = {
  title: "Hello World",
  slug: "hello-world",
  excerpt: "An excerpt.",
  coverImageUrl: "https://cdn.example.com/cover.jpg",
  publishedAt: new Date("2026-01-15T10:00:00.000Z"),
  updatedAt: new Date("2026-01-16T10:00:00.000Z"),
  canonicalUrl: "https://site.example.com/blog/hello-world",
  author: { displayName: "Jane Doe", slug: "jane", url: "https://site.example.com/author/jane" },
} satisfies Partial<JsonLdInput>;

describe("generateJsonLd", () => {
  it("BLOG -> BlogPosting with headline, datePublished, author, image", () => {
    const ld = generateJsonLd({ ...base, type: "BLOG" });
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("BlogPosting");
    expect(ld.headline).toBe("Hello World");
    expect(ld.datePublished).toBe("2026-01-15T10:00:00.000Z");
    expect(ld.image).toBe("https://cdn.example.com/cover.jpg");
    expect((ld.author as Record<string, unknown>)["@type"]).toBe("Person");
    expect((ld.author as Record<string, unknown>).name).toBe("Jane Doe");
  });

  it("NEWS -> NewsArticle", () => {
    const ld = generateJsonLd({ ...base, type: "NEWS" });
    expect(ld["@type"]).toBe("NewsArticle");
    expect(ld.headline).toBe("Hello World");
  });

  it("WEBINAR -> Event with startDate/endDate and registration url", () => {
    const ld = generateJsonLd({
      ...base,
      type: "WEBINAR",
      typeData: {
        startAt: "2026-03-01T17:00:00.000Z",
        endAt: "2026-03-01T18:00:00.000Z",
        registrationUrl: "https://site.example.com/register",
      },
    });
    expect(ld["@type"]).toBe("Event");
    expect(ld.name).toBe("Hello World");
    expect(ld.startDate).toBe("2026-03-01T17:00:00.000Z");
    expect(ld.endDate).toBe("2026-03-01T18:00:00.000Z");
    expect(ld.url).toBe("https://site.example.com/register");
    expect((ld.location as Record<string, unknown>)["@type"]).toBe("VirtualLocation");
    expect((ld.location as Record<string, unknown>).url).toBe("https://site.example.com/register");
  });

  it("FAQ -> FAQPage with mainEntity Q&A (supports question/answer and q/a keys)", () => {
    const ld = generateJsonLd({
      ...base,
      type: "FAQ",
      typeData: {
        faqItems: [
          { question: "What is it?", answer: "A CMS." },
          { q: "Is it free?", a: "Yes." },
          { question: "missing answer" }, // dropped — incomplete
        ],
      },
    });
    expect(ld["@type"]).toBe("FAQPage");
    const main = ld.mainEntity as Array<Record<string, unknown>>;
    expect(main).toHaveLength(2);
    expect(main[0]["@type"]).toBe("Question");
    expect(main[0].name).toBe("What is it?");
    expect((main[0].acceptedAnswer as Record<string, unknown>).text).toBe("A CMS.");
    expect(main[1].name).toBe("Is it free?");
    expect((main[1].acceptedAnswer as Record<string, unknown>).text).toBe("Yes.");
  });

  it("RESOURCE (ungated) -> Article with associatedMedia download link", () => {
    const ld = generateJsonLd({
      ...base,
      type: "RESOURCE",
      gated: false,
      typeData: { downloadUrl: "https://cdn.example.com/guide.pdf", fileLabel: "The Guide" },
    });
    expect(ld["@type"]).toBe("Article");
    const media = ld.associatedMedia as Record<string, unknown>;
    expect(media["@type"]).toBe("CreativeWork");
    expect(media.url).toBe("https://cdn.example.com/guide.pdf");
    expect(media.name).toBe("The Guide");
  });

  it("RESOURCE (gated) -> Article that OMITS the download URL (NFR-SEC-03/NG3)", () => {
    const ld = generateJsonLd({
      ...base,
      type: "RESOURCE",
      gated: true,
      typeData: { downloadUrl: "https://cdn.example.com/secret.pdf" },
    });
    expect(ld["@type"]).toBe("Article");
    expect(ld.associatedMedia).toBeUndefined();
    // The secret URL must not appear anywhere in the serialized JSON-LD.
    expect(JSON.stringify(ld)).not.toContain("secret.pdf");
  });

  it("RESEARCH -> plain Article with no download media (mirrors BLOG)", () => {
    const ld = generateJsonLd({
      ...base,
      type: "RESEARCH",
      gated: false,
      typeData: { downloadUrl: "https://cdn.example.com/report.pdf" },
    });
    expect(ld["@type"]).toBe("Article");
    // Research is a plain long-form article — never a download, so any stray
    // typeData.downloadUrl must not surface in structured data.
    expect(ld.associatedMedia).toBeUndefined();
    expect(JSON.stringify(ld)).not.toContain("report.pdf");
  });

  it("omits undefined fields (no author/image) cleanly", () => {
    const ld = generateJsonLd({
      type: "BLOG",
      title: "Bare",
      slug: "bare",
      publishedAt: null,
      author: null,
    });
    expect(ld["@type"]).toBe("BlogPosting");
    expect("author" in ld).toBe(false);
    expect("image" in ld).toBe(false);
    expect("datePublished" in ld).toBe(false);
  });
});
