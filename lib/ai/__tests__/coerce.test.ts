import { describe, it, expect } from "vitest";
import { htmlToTiptap } from "@/lib/ai/coerce";

/** Recursively collect every node `type` present in a Tiptap doc. */
function collectTypes(node: unknown, acc: Set<string> = new Set()): Set<string> {
  if (!node || typeof node !== "object") return acc;
  const n = node as { type?: string; content?: unknown[] };
  if (n.type) acc.add(n.type);
  if (Array.isArray(n.content)) for (const c of n.content) collectTypes(c, acc);
  return acc;
}

describe("htmlToTiptap — valid HTML", () => {
  it("converts allowed tags into a doc with the matching nodes", () => {
    const html =
      "<h2>Title</h2><p>A <strong>bold</strong> and <em>italic</em> line.</p><ul><li>one</li><li>two</li></ul>";
    const { doc, needsReview } = htmlToTiptap(html);

    expect(needsReview).toBe(false);
    expect(doc.type).toBe("doc");
    expect(doc.content.length).toBeGreaterThan(0);

    const types = collectTypes(doc);
    expect(types.has("heading")).toBe(true);
    expect(types.has("paragraph")).toBe(true);
    expect(types.has("bulletList")).toBe(true);
    expect(types.has("listItem")).toBe(true);
  });

  it("strips a leading/trailing ```html code fence", () => {
    const html = "```html\n<p>Inside a fence.</p>\n```";
    const { doc, needsReview } = htmlToTiptap(html);
    expect(needsReview).toBe(false);
    const types = collectTypes(doc);
    expect(types.has("paragraph")).toBe(true);
  });

  it("drops disallowed nodes (script/div) while keeping allowed siblings", () => {
    const html =
      "<p>Keep me.</p><script>alert(1)</script><div>drop wrapper</div>";
    const { doc } = htmlToTiptap(html);
    const serialized = JSON.stringify(doc);
    expect(serialized).toContain("Keep me.");
    expect(serialized).not.toContain("alert(1)");
    // No raw HTML tag names should appear as node types.
    const types = collectTypes(doc);
    expect(types.has("script")).toBe(false);
  });

  it("preserves link marks for allowed protocols", () => {
    const html = '<p><a href="https://example.com">link</a></p>';
    const { doc, needsReview } = htmlToTiptap(html);
    expect(needsReview).toBe(false);
    expect(JSON.stringify(doc)).toContain("example.com");
  });
});

describe("htmlToTiptap — malformed / empty -> fallback", () => {
  it("returns a fallback doc + needsReview for empty input", () => {
    const { doc, needsReview } = htmlToTiptap("");
    expect(needsReview).toBe(true);
    expect(doc.type).toBe("doc");
    expect(doc.content.length).toBe(1);
    expect((doc.content[0] as { type: string }).type).toBe("paragraph");
  });

  it("falls back when the input contains only disallowed tags", () => {
    const { doc, needsReview } = htmlToTiptap("<div></div><span></span>");
    expect(needsReview).toBe(true);
    expect(JSON.stringify(doc)).toContain('"type":"paragraph"');
  });

  it("never throws on garbage input and always returns a doc", () => {
    const { doc } = htmlToTiptap("<<<>>> not really html &&&");
    expect(doc.type).toBe("doc");
    expect(Array.isArray(doc.content)).toBe(true);
  });
});
