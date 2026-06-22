/**
 * Pure unit tests for the inline Tiptap body-embed walk (FR-MEDIA-04).
 * No S3 / DB — only the pure `findEmbeddedAssetRefs` helper over fake docs.
 */
import { describe, it, expect } from "vitest";
import { findEmbeddedAssetRefs, type EmbedAssetMatch } from "@/lib/media/embeds";

const ASSET: EmbedAssetMatch = {
  id: "asset-123",
  url: "https://cdn.example.com/media/photo.jpg",
  storageKey: "media/2026/photo.jpg",
};

/** Wrap inline nodes in a minimal Tiptap doc shell. */
function doc(...content: unknown[]) {
  return { type: "doc", content };
}

describe("findEmbeddedAssetRefs", () => {
  it("matches an image node referencing the asset by assetId attr", () => {
    const d = doc({ type: "image", attrs: { assetId: "asset-123" } });
    expect(findEmbeddedAssetRefs(d, ASSET)).toBe(true);
  });

  it("matches when the asset url appears in the image src", () => {
    const d = doc({
      type: "image",
      attrs: { src: "https://cdn.example.com/media/photo.jpg?w=800" },
    });
    expect(findEmbeddedAssetRefs(d, ASSET)).toBe(true);
  });

  it("matches when the storageKey appears in the image src", () => {
    const d = doc({
      type: "image",
      attrs: { src: "/proxy?key=media/2026/photo.jpg" },
    });
    expect(findEmbeddedAssetRefs(d, ASSET)).toBe(true);
  });

  it("matches custom image-like node types (e.g. imageBlock)", () => {
    const d = doc({ type: "imageBlock", attrs: { assetId: "asset-123" } });
    expect(findEmbeddedAssetRefs(d, ASSET)).toBe(true);
  });

  it("finds images nested deep in the document tree", () => {
    const d = doc({
      type: "figure",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hi" }] },
        { type: "image", attrs: { assetId: "asset-123" } },
      ],
    });
    expect(findEmbeddedAssetRefs(d, ASSET)).toBe(true);
  });

  it("does not match a different asset", () => {
    const d = doc({
      type: "image",
      attrs: { assetId: "other-asset", src: "https://cdn.example.com/x.jpg" },
    });
    expect(findEmbeddedAssetRefs(d, ASSET)).toBe(false);
  });

  it("ignores non-image nodes that merely contain the id as text", () => {
    const d = doc({
      type: "paragraph",
      content: [{ type: "text", text: "see asset-123 for details" }],
    });
    expect(findEmbeddedAssetRefs(d, ASSET)).toBe(false);
  });

  it("handles empty / malformed docs without throwing", () => {
    expect(findEmbeddedAssetRefs(null, ASSET)).toBe(false);
    expect(findEmbeddedAssetRefs(undefined, ASSET)).toBe(false);
    expect(findEmbeddedAssetRefs({}, ASSET)).toBe(false);
    expect(findEmbeddedAssetRefs(doc(), ASSET)).toBe(false);
    expect(findEmbeddedAssetRefs({ type: "image" }, ASSET)).toBe(false);
  });

  it("does not match url/key when the asset has empty url+key (id-only)", () => {
    const idOnly: EmbedAssetMatch = { id: "asset-123", url: "", storageKey: "" };
    // src that doesn't carry the id must not false-positive on empty includes("").
    const d = doc({ type: "image", attrs: { src: "https://cdn.example.com/z.jpg" } });
    expect(findEmbeddedAssetRefs(d, idOnly)).toBe(false);
  });
});
