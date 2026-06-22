import { describe, it, expect } from "vitest";
import {
  tiptapToPlainText,
  diffLines,
  diffRevisions,
  type TiptapDoc,
} from "@/lib/editor/diff";

describe("tiptapToPlainText", () => {
  it("flattens headings, paragraphs and list items onto separate lines", () => {
    const doc: TiptapDoc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "one" }] },
              ],
            },
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "two" }] },
              ],
            },
          ],
        },
      ],
    };
    expect(tiptapToPlainText(doc)).toBe("Title\nHello world\none\ntwo");
  });

  it("returns empty string for null/empty docs", () => {
    expect(tiptapToPlainText(null)).toBe("");
    expect(tiptapToPlainText(undefined)).toBe("");
    expect(tiptapToPlainText({})).toBe("");
  });

  it("preserves empty paragraphs as blank lines", () => {
    const doc: TiptapDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    };
    expect(tiptapToPlainText(doc)).toBe("a\n\nb");
  });
});

describe("diffLines", () => {
  it("marks unchanged lines as same", () => {
    expect(diffLines("a\nb", "a\nb")).toEqual([
      { type: "same", text: "a" },
      { type: "same", text: "b" },
    ]);
  });

  it("detects added lines", () => {
    expect(diffLines("a\nc", "a\nb\nc")).toEqual([
      { type: "same", text: "a" },
      { type: "added", text: "b" },
      { type: "same", text: "c" },
    ]);
  });

  it("detects removed lines", () => {
    expect(diffLines("a\nb\nc", "a\nc")).toEqual([
      { type: "same", text: "a" },
      { type: "removed", text: "b" },
      { type: "same", text: "c" },
    ]);
  });

  it("detects a replaced line as remove + add", () => {
    const result = diffLines("hello", "world");
    expect(result).toContainEqual({ type: "removed", text: "hello" });
    expect(result).toContainEqual({ type: "added", text: "world" });
  });

  it("handles empty before (all added) and empty after (all removed)", () => {
    expect(diffLines("", "x\ny")).toEqual([
      { type: "added", text: "x" },
      { type: "added", text: "y" },
    ]);
    expect(diffLines("x\ny", "")).toEqual([
      { type: "removed", text: "x" },
      { type: "removed", text: "y" },
    ]);
  });
});

describe("diffRevisions", () => {
  const para = (text: string): TiptapDoc => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

  it("produces a body line diff", () => {
    const out = diffRevisions(
      { body: para("old text") },
      { body: para("new text") }
    );
    expect(out.body).toContainEqual({ type: "removed", text: "old text" });
    expect(out.body).toContainEqual({ type: "added", text: "new text" });
  });

  it("detects changed, added and removed SEO fields", () => {
    const out = diffRevisions(
      { body: para("x"), seo: { metaTitle: "Old", noindex: false } },
      { body: para("x"), seo: { metaTitle: "New", canonicalUrl: "/c" } }
    );
    // metaTitle changed
    expect(out.seoChanged).toContainEqual({
      field: "metaTitle",
      before: "Old",
      after: "New",
    });
    // noindex:false stringifies to null (treated as unset) so it is unchanged
    // canonicalUrl added
    expect(out.seoChanged).toContainEqual({
      field: "canonicalUrl",
      before: null,
      after: "/c",
    });
  });

  it("detects typeData changes including nested objects", () => {
    const out = diffRevisions(
      { body: para("x"), typeData: { faqItems: [{ question: "q1", answer: "a1" }] } },
      { body: para("x"), typeData: { faqItems: [{ question: "q1", answer: "a2" }] } }
    );
    expect(out.typeDataChanged).toHaveLength(1);
    expect(out.typeDataChanged[0].field).toBe("faqItems");
  });

  it("reports no changes when snapshots are identical", () => {
    const snap = {
      body: para("same"),
      seo: { metaTitle: "T" },
      typeData: { readTime: 5 },
    };
    const out = diffRevisions(snap, snap);
    expect(out.body.every((l) => l.type === "same")).toBe(true);
    expect(out.seoChanged).toEqual([]);
    expect(out.typeDataChanged).toEqual([]);
  });

  it("treats missing seo/typeData as empty without throwing", () => {
    const out = diffRevisions({ body: para("a") }, { body: para("a") });
    expect(out.seoChanged).toEqual([]);
    expect(out.typeDataChanged).toEqual([]);
  });
});
