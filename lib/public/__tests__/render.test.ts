import { describe, it, expect } from "vitest";
import { renderTiptapToHtml, stripEmptyParagraphs } from "@/lib/public/render";

const para = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const emptyPara = { type: "paragraph" };
const emptyParaWithArray = { type: "paragraph", content: [] };

describe("stripEmptyParagraphs", () => {
  it("drops empty paragraphs (no content / empty content array)", () => {
    const out = stripEmptyParagraphs([
      para("A"),
      emptyPara,
      emptyParaWithArray,
      para("B"),
    ]);
    expect(out).toEqual([para("A"), para("B")]);
  });

  it("keeps non-paragraph nodes and paragraphs with content", () => {
    const hr = { type: "horizontalRule" };
    const out = stripEmptyParagraphs([para("A"), hr, para("B")]);
    expect(out).toEqual([para("A"), hr, para("B")]);
  });
});

describe("renderTiptapToHtml", () => {
  it("does not emit empty <p></p> for blank-line spacers", () => {
    const html = renderTiptapToHtml({
      type: "doc",
      content: [para("First."), emptyPara, para("Second.")],
    });
    expect(html).not.toContain("<p></p>");
    expect(html).toBe("<p>First.</p><p>Second.</p>");
  });

  it("returns empty string when only empty paragraphs remain", () => {
    expect(
      renderTiptapToHtml({ type: "doc", content: [emptyPara, emptyParaWithArray] }),
    ).toBe("");
  });

  // Regression: the renderer once kept a local extension list that lagged the
  // editor's — any doc using a newer node/mark (highlight, task list, text
  // align, color) threw in generateHTML and shipped an EMPTY body to the site.
  it("renders every node/mark the editor can produce (no schema drift)", () => {
    const html = renderTiptapToHtml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              text: "Key takeaways",
              marks: [
                { type: "highlight" },
                { type: "textStyle", attrs: { color: "#C2410C" } },
              ],
            },
          ],
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [para("Measure before you optimize.")],
            },
          ],
        },
      ],
    });
    expect(html).not.toBe("");
    expect(html).toContain("Key takeaways");
    expect(html).toContain("Measure before you optimize.");
  });
});
