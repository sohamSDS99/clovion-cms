import { describe, it, expect } from "vitest";
import { parseFaqJson } from "@/lib/ai/faqParse";

describe("parseFaqJson", () => {
  const arr = [{ question: "Q?", answer: "A." }];

  it("parses a bare JSON array", () => {
    expect(parseFaqJson(JSON.stringify(arr))).toEqual(arr);
  });

  it("parses a ```json fenced array", () => {
    expect(parseFaqJson("```json\n" + JSON.stringify(arr) + "\n```")).toEqual(arr);
  });

  it("slices the array out of surrounding prose", () => {
    expect(
      parseFaqJson("Here are your FAQs:\n" + JSON.stringify(arr) + "\nHope that helps!")
    ).toEqual(arr);
  });

  it("returns null on unparseable input", () => {
    expect(parseFaqJson("not json at all")).toBeNull();
  });
});
