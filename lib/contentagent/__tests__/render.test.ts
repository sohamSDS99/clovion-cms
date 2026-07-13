import { describe, it, expect } from "vitest";
import { renderDocx, renderXlsx } from "@/lib/contentagent/render";

describe("renderDocx", () => {
  it("produces a valid non-empty docx buffer", async () => {
    const buf = await renderDocx({
      title: "AI Visibility Audit Worksheet",
      intro: "Use this alongside lesson 2.",
      sections: [
        {
          heading: "Your prompt set",
          paragraphs: ["List the prompts you'll track."],
          bullets: ["Brand-name prompts", "Category prompts"],
          table: { headers: ["Prompt", "Engine", "Mentioned?"], rows: [["best sds software", "ChatGPT", "Y"]] },
        },
      ],
    });
    expect(buf.length).toBeGreaterThan(1000);
    // docx files are zip archives: PK magic bytes.
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});

describe("renderXlsx", () => {
  it("produces a valid non-empty xlsx buffer", async () => {
    const buf = await renderXlsx({
      sheets: [
        {
          name: "Tracker",
          headers: ["Prompt", "Mentioned", "Cited", "Notes"],
          rows: [["best X for Y", "Y", "N", "example row"]],
          widths: [40, 12, 12, 40],
        },
      ],
    });
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});
