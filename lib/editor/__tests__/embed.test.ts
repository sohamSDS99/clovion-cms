import { describe, expect, it } from "vitest";
import { toEmbedUrl } from "@/lib/editor/embed";

describe("toEmbedUrl", () => {
  it("converts YouTube watch URLs", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });
  it("converts youtu.be short URLs", () => {
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });
  it("converts Vimeo URLs", () => {
    expect(toEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789"
    );
  });
  it("converts Loom share URLs", () => {
    expect(toEmbedUrl("https://www.loom.com/share/abc123")).toBe(
      "https://www.loom.com/embed/abc123"
    );
  });
  it("rejects unsupported hosts", () => {
    expect(toEmbedUrl("https://example.com/video")).toBeNull();
  });
  it("rejects non-URLs", () => {
    expect(toEmbedUrl("not a url")).toBeNull();
    expect(toEmbedUrl("")).toBeNull();
  });
});
