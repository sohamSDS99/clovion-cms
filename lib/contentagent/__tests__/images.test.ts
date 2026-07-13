import { describe, it, expect } from "vitest";
import { parseImagesBlock, buildImageDesignPrompt } from "@/lib/contentagent/images";

const block = `COVER
TYPE: design
SIZE: 1600x900
SHOWS: The follow-up funnel as a visual.
BRIEF: Wide funnel, title phrase centered.

IMAGE 1
TYPE: screenshot
PLACEMENT: after the heading "How do I see my per-engine visibility?"
SHOWS: The per-engine visibility table with ChatGPT expanded.
CAPTURE: AI Visibility Tracking, engine breakdown view, 30-day range.

IMAGE 2
TYPE: design
SHOWS: How one buyer constraint filters the AI shortlist.
BRIEF: Funnel diagram, three stages labeled "First answer (10 brands)",
"One constraint (3.8 brands)", "Follow-up (survivors)". Mono labels.`;

describe("parseImagesBlock", () => {
  it("parses cover + entries with type, size, shows, capture/brief", () => {
    const entries = parseImagesBlock(block);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ isCover: true, size: "1600x900" });
    expect(entries[1]).toMatchObject({ n: 1, type: "screenshot" });
    expect(entries[1].capture).toContain("AI Visibility Tracking");
    expect(entries[1].placement).toContain("per-engine visibility");
    expect(entries[1].brief).toBeNull();
    expect(entries[2]).toMatchObject({ n: 2, type: "design" });
    expect(entries[2].brief).toContain("Funnel diagram");
    // unknown/missing SIZE falls back to the house default
    expect(entries[2].size).toBe("1600x900");
  });
  it("returns [] for null/empty/non-image spec", () => {
    expect(parseImagesBlock(null)).toEqual([]);
    expect(parseImagesBlock("")).toEqual([]);
    expect(parseImagesBlock("TITLE: X\nSECTION: A")).toEqual([]);
  });
  it("design prompt defers to the Claude Design system and carries the brief", () => {
    const [, , design] = parseImagesBlock(block);
    const prompt = buildImageDesignPrompt(design);
    expect(prompt).toContain("Clovion design system");
    expect(prompt).toContain("Funnel diagram");
    expect(prompt).toContain("1600×900");
  });
  it("cover prompt carries the social-share crop guidance", () => {
    const [cover] = parseImagesBlock(block);
    const prompt = buildImageDesignPrompt(cover);
    expect(prompt).toContain("blog cover image");
    expect(prompt).toContain("1.91:1");
  });
});
