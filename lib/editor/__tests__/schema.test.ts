import { describe, it, expect } from "vitest";
import {
  validateJsonLd,
  schemaTypes,
  formatJsonLd,
} from "@/lib/editor/schema";

describe("validateJsonLd", () => {
  it("treats empty/whitespace as valid-but-empty", () => {
    expect(validateJsonLd("")).toEqual({ valid: true, error: null, value: null });
    expect(validateJsonLd("   \n ")).toMatchObject({ valid: true, value: null });
  });

  it("accepts a single object", () => {
    const r = validateJsonLd('{"@context":"https://schema.org","@type":"Article"}');
    expect(r.valid).toBe(true);
    expect(r.error).toBeNull();
  });

  it("accepts an array of objects", () => {
    const r = validateJsonLd('[{"@type":"FAQPage"},{"@type":"WebPage"}]');
    expect(r.valid).toBe(true);
  });

  it("rejects malformed JSON with a readable message", () => {
    const r = validateJsonLd("{ not: json }");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Invalid JSON/);
  });

  it("rejects a bare scalar / null", () => {
    expect(validateJsonLd("42").valid).toBe(false);
    expect(validateJsonLd("null").valid).toBe(false);
    expect(validateJsonLd('"a string"').valid).toBe(false);
  });

  it("rejects empty arrays and arrays of non-objects", () => {
    expect(validateJsonLd("[]").valid).toBe(false);
    expect(validateJsonLd("[1,2,3]").valid).toBe(false);
  });
});

describe("schemaTypes", () => {
  it("reads @type from a single object", () => {
    const { value } = validateJsonLd('{"@type":"Article"}');
    expect(schemaTypes(value)).toEqual(["Article"]);
  });

  it("reads @type from each array member, de-duplicated", () => {
    const { value } = validateJsonLd(
      '[{"@type":"FAQPage"},{"@type":"Question"},{"@type":"FAQPage"}]'
    );
    expect(schemaTypes(value)).toEqual(["FAQPage", "Question"]);
  });

  it("descends into @graph", () => {
    const { value } = validateJsonLd(
      '{"@graph":[{"@type":"WebSite"},{"@type":"Organization"}]}'
    );
    expect(schemaTypes(value)).toEqual(["WebSite", "Organization"]);
  });

  it("handles an array-valued @type", () => {
    const { value } = validateJsonLd('{"@type":["Article","BlogPosting"]}');
    expect(schemaTypes(value)).toEqual(["Article", "BlogPosting"]);
  });

  it("returns [] for typeless input", () => {
    expect(schemaTypes({ foo: "bar" })).toEqual([]);
    expect(schemaTypes(null)).toEqual([]);
  });
});

describe("formatJsonLd", () => {
  it("pretty-prints with 2-space indent", () => {
    expect(formatJsonLd({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("returns empty string for nullish", () => {
    expect(formatJsonLd(null)).toBe("");
    expect(formatJsonLd(undefined)).toBe("");
  });
});
