import { describe, it, expect } from "vitest";
import { agentCreateContentSchema } from "@/lib/agent/schemas";

const base = {
  type: "BLOG",
  title: "How AI engines pick sources",
  bodyHtml: "<h2>Answer first</h2><p>Engines cite what they can quote.</p>",
};

describe("agentCreateContentSchema", () => {
  it("accepts a minimal valid submission", () => {
    expect(agentCreateContentSchema.safeParse(base).success).toBe(true);
  });

  it("rejects missing bodyHtml", () => {
    const { bodyHtml: _omit, ...rest } = base;
    expect(agentCreateContentSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-kebab slugs", () => {
    expect(agentCreateContentSchema.safeParse({ ...base, slug: "Not A Slug" }).success).toBe(false);
    expect(agentCreateContentSchema.safeParse({ ...base, slug: "valid-slug-2" }).success).toBe(true);
  });

  it("rejects unknown top-level fields (strict) — no status/lifecycle surface", () => {
    expect(agentCreateContentSchema.safeParse({ ...base, status: "PUBLISHED" }).success).toBe(false);
    expect(agentCreateContentSchema.safeParse({ ...base, publish: true }).success).toBe(false);
  });

  it("validates typeData against the per-type schema", () => {
    const bad = { ...base, type: "WEBINAR", typeData: { startAt: "not-a-date" } };
    const result = agentCreateContentSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "typeData")).toBe(true);
    }
  });

  it("enforces seo limits", () => {
    const bad = { ...base, seo: { metaTitle: "x".repeat(80) } };
    expect(agentCreateContentSchema.safeParse(bad).success).toBe(false);
  });
});
