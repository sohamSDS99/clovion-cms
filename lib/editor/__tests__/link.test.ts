import { describe, it, expect } from "vitest";
import { isInternalHref, linkRelTarget } from "@/lib/editor/link";

describe("isInternalHref", () => {
  it("treats relative paths, anchors and queries as internal", () => {
    expect(isInternalHref("/blog/x")).toBe(true);
    expect(isInternalHref("#section")).toBe(true);
    expect(isInternalHref("?ref=nav")).toBe(true);
    expect(isInternalHref("team/about")).toBe(true);
  });

  it("treats absolute and schemed URLs as not internal", () => {
    expect(isInternalHref("https://example.com")).toBe(false);
    expect(isInternalHref("http://example.com")).toBe(false);
    expect(isInternalHref("mailto:a@b.com")).toBe(false);
    expect(isInternalHref("tel:+123")).toBe(false);
  });

  it("returns false for empty/nullish", () => {
    expect(isInternalHref("")).toBe(false);
    expect(isInternalHref(null)).toBe(false);
    expect(isInternalHref(undefined)).toBe(false);
  });
});

describe("linkRelTarget", () => {
  it("keeps internal links same-tab and drops nofollow", () => {
    expect(linkRelTarget("/blog/x")).toEqual({ rel: "noopener", target: null });
  });

  it("forces external links to a new tab with nofollow", () => {
    expect(linkRelTarget("https://example.com")).toEqual({
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    });
  });

  it("gives mailto/tel no rel or target", () => {
    expect(linkRelTarget("mailto:a@b.com")).toEqual({ rel: null, target: null });
    expect(linkRelTarget("tel:+123")).toEqual({ rel: null, target: null });
  });
});
