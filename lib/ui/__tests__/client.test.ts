/**
 * normalizeLinkedInUrl — turns user-typed LinkedIn input into an absolute URL so
 * it satisfies the server's strict socialLinks `.url()` check instead of 400-ing.
 */
import { describe, expect, it } from "vitest";
import { normalizeLinkedInUrl } from "../client";

describe("normalizeLinkedInUrl", () => {
  it("passes through an absolute URL unchanged", () => {
    const u = "https://www.linkedin.com/in/jane-doe/";
    expect(normalizeLinkedInUrl(u)).toBe(u);
    expect(normalizeLinkedInUrl("http://linkedin.com/in/x")).toBe("http://linkedin.com/in/x");
  });

  it("adds https:// to a schemeless linkedin domain", () => {
    expect(normalizeLinkedInUrl("linkedin.com/in/jane")).toBe("https://linkedin.com/in/jane");
    expect(normalizeLinkedInUrl("www.linkedin.com/in/jane")).toBe("https://www.linkedin.com/in/jane");
  });

  it("expands a bare handle into a full profile URL", () => {
    expect(normalizeLinkedInUrl("jane-doe")).toBe("https://www.linkedin.com/in/jane-doe");
    expect(normalizeLinkedInUrl("@jane-doe")).toBe("https://www.linkedin.com/in/jane-doe");
  });

  it("treats a dotted handle as a handle, not a bogus domain", () => {
    // Regression: "john.doe" must not become https://john.doe.
    expect(normalizeLinkedInUrl("john.doe")).toBe("https://www.linkedin.com/in/john.doe");
  });

  it("trims and treats blank as empty (caller drops the key)", () => {
    expect(normalizeLinkedInUrl("   ")).toBe("");
    expect(normalizeLinkedInUrl("")).toBe("");
    expect(normalizeLinkedInUrl("  https://x.com  ")).toBe("https://x.com");
  });

  it("produces a value the server URL check accepts", () => {
    for (const input of ["jane", "linkedin.com/in/jane", "https://x.io/a"]) {
      // new URL() throwing would mean zod .url() rejects → the 400 we're avoiding.
      expect(() => new URL(normalizeLinkedInUrl(input))).not.toThrow();
    }
  });
});
