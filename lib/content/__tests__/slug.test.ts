/**
 * Pure unit tests for slugify (no DB). ensureUniqueSlug is DB-bound and
 * exercised in integration tests later.
 */
import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/content/slug";

describe("slugify", () => {
  it("kebab-cases a simple title", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("lowercases everything", () => {
    expect(slugify("MixedCASE Title")).toBe("mixedcase-title");
  });

  it("collapses repeated separators and trims hyphens", () => {
    expect(slugify("  Spaced   --  Out  ")).toBe("spaced-out");
  });

  it("strips punctuation and symbols", () => {
    expect(slugify("Node.js & TypeScript: A Guide!")).toBe(
      "node-js-typescript-a-guide"
    );
  });

  it("removes diacritics", () => {
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
  });

  it("keeps digits", () => {
    expect(slugify("Top 10 Tips for 2026")).toBe("top-10-tips-for-2026");
  });

  it("only produces the allowed charset [a-z0-9-]", () => {
    const out = slugify("Hello, World! @#$ 123 — Über");
    expect(out).toMatch(/^[a-z0-9-]*$/);
  });

  it("returns empty string for symbol-only input", () => {
    expect(slugify("!@#$%^&*()")).toBe("");
  });

  it("has no leading or trailing hyphen", () => {
    const out = slugify("---Edge Case---");
    expect(out.startsWith("-")).toBe(false);
    expect(out.endsWith("-")).toBe(false);
    expect(out).toBe("edge-case");
  });
});
