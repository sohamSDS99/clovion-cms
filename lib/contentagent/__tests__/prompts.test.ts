import { describe, it, expect } from "vitest";
import {
  parseJsonOutput,
  extractArticleTitle,
  orchestratorMessages,
  writerMessages,
  qaMessages,
  splitDeliverable,
  joinDeliverable,
} from "@/lib/contentagent/prompts";
import type { AgentRun } from "@prisma/client";

const run = {
  id: "r1",
  channel: "LINKEDIN_PERSONAL",
  postType: "research-insight",
  format: null,
  allowResearch: true,
  brief: "Post about the 67% constraint finding.",
  sourceReport: null,
  plan: null,
  draftText: null,
  feedback: [],
} as unknown as AgentRun;

describe("parseJsonOutput", () => {
  it("parses plain JSON", () => {
    expect(parseJsonOutput<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips code fences", () => {
    expect(parseJsonOutput<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("extracts JSON embedded in prose", () => {
    expect(parseJsonOutput<{ pass: boolean }>('Here you go: {"pass":true} — done')).toEqual({ pass: true });
  });
  it("throws on non-JSON", () => {
    expect(() => parseJsonOutput("no json here")).toThrow();
  });
});

describe("extractArticleTitle", () => {
  it("pulls the title comment and strips it from the body", () => {
    const { title, body } = extractArticleTitle('<!--title: My Great Post -->\n<h2>Intro</h2>');
    expect(title).toBe("My Great Post");
    expect(body.startsWith("<h2>")).toBe(true);
  });
  it("returns null title when absent", () => {
    const { title, body } = extractArticleTitle("<p>hello</p>");
    expect(title).toBeNull();
    expect(body).toBe("<p>hello</p>");
  });
});

describe("visual formats", () => {
  it("infographic format demands the two-part graphic spec + caption output", () => {
    const infRun = { ...run, channel: "LINKEDIN_COMPANY", format: "infographic" } as AgentRun;
    const msgs = writerMessages(infRun, {});
    expect(msgs[0].content).toContain("GRAPHIC SPEC");
    expect(msgs[0].content).toContain("repeating labeled micro-pattern");
    expect(msgs[1].content).toContain("VISUAL FORMAT");
  });
  it("carousel format demands the slide-by-slide output", () => {
    const carRun = { ...run, channel: "META_SOCIAL", format: "carousel" } as AgentRun;
    const msgs = writerMessages(carRun, {});
    expect(msgs[0].content).toContain("SLIDES");
    expect(msgs[0].content).toContain("one idea per slide");
  });
  it("plain caption rule applies for static/no format", () => {
    const msgs = writerMessages(run, {});
    expect(msgs[0].content).toContain("plain text");
    expect(msgs[0].content).not.toContain("GRAPHIC SPEC");
  });
});

describe("splitDeliverable / joinDeliverable", () => {
  it("splits a three-part deliverable into content, spec, and caption", () => {
    const raw =
      "=== CONTENT ===\nFull prose here.\n\n=== GRAPHIC SPEC ===\nTITLE: X\nSECTION: A\n\n=== CAPTION ===\nHook line one.";
    const { content, spec, caption } = splitDeliverable(raw);
    expect(content).toBe("Full prose here.");
    expect(spec).toBe("TITLE: X\nSECTION: A");
    expect(caption).toBe("Hook line one.");
  });
  it("handles two-part spec+caption output (no content block)", () => {
    const raw = "=== GRAPHIC SPEC ===\nTITLE: X\n\n=== CAPTION ===\nHook.";
    const { content, spec, caption } = splitDeliverable(raw);
    expect(content).toBeNull();
    expect(spec).toBe("TITLE: X");
    expect(caption).toBe("Hook.");
  });
  it("handles IMAGES as the spec marker (articles)", () => {
    const raw = "<!--title: T -->\n<p>Body</p>\n[IMAGE 1]\n\n=== IMAGES ===\nIMAGE 1\nTYPE: design\nSHOWS: X.";
    const { content, spec } = splitDeliverable(raw);
    expect(content).toContain("<p>Body</p>");
    expect(spec).toContain("TYPE: design");
  });
  it("article writer rule demands IMAGE markers + IMAGES block and product weaving is loaded", () => {
    const artRun = { ...run, channel: "BLOG_ARTICLE", format: null } as AgentRun;
    const msgs = writerMessages(artRun, {});
    expect(msgs[0].content).toContain("=== IMAGES ===");
    expect(msgs[0].content).toContain("CLOVION PRODUCT KNOWLEDGE");
    expect(msgs[0].content).toContain("Recommendation Engine");
  });
  it("handles SLIDES as the spec marker", () => {
    const raw = "=== CONTENT ===\nProse.\n\n=== SLIDES ===\nSLIDE 1: Hook\n\n=== CAPTION ===\nCap.";
    const { spec } = splitDeliverable(raw);
    expect(spec).toBe("SLIDE 1: Hook");
  });
  it("returns plain text as content only", () => {
    const { content, spec, caption } = splitDeliverable("Just a plain caption post.");
    expect(content).toBe("Just a plain caption post.");
    expect(spec).toBeNull();
    expect(caption).toBeNull();
  });
  it("round-trips through joinDeliverable", () => {
    const joined = joinDeliverable("PROSE", "SPEC BODY", "CAPTION BODY");
    const back = splitDeliverable(joined);
    expect(back.content).toBe("PROSE");
    expect(back.spec).toBe("SPEC BODY");
    expect(back.caption).toBe("CAPTION BODY");
  });
});

describe("role prompts", () => {
  it("orchestrator carries voice + channel + brief", () => {
    const msgs = orchestratorMessages(run);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("sharpest person in the room");
    expect(msgs[0].content).toContain("Zahir's personal LinkedIn");
    expect(msgs[1].content).toContain("67% constraint finding");
  });
  it("writer forbids invented numbers", () => {
    const msgs = writerMessages(run, { angle: "x" });
    expect(msgs[0].content).toContain("Never invent numbers");
  });
  it("qa checks fabrication and the checklist", () => {
    const msgs = qaMessages(run, "draft text");
    expect(msgs[0].content).toContain("FABRICATION");
    expect(msgs[0].content).toContain("30-second checklist");
  });
  it("caption channels demand plain text, article channels demand HTML", () => {
    const captionMsgs = writerMessages(run, {});
    expect(captionMsgs[0].content).toContain("plain text");
    const articleRun = { ...run, channel: "BLOG_ARTICLE" } as AgentRun;
    const articleMsgs = writerMessages(articleRun, {});
    expect(articleMsgs[0].content).toContain("clean HTML");
  });
});

describe("learning loop prompts", () => {
  it("lessonsBlock renders rules or nothing", async () => {
    const { lessonsBlock } = await import("@/lib/contentagent/prompts");
    expect(lessonsBlock([])).toBe("");
    const block = lessonsBlock(["Keep intros to one line.", "No closing questions."]);
    expect(block).toContain("LEARNED STYLE RULES");
    expect(block).toContain("1. Keep intros to one line.");
    expect(block).toContain("2. No closing questions.");
  });
  it("learnerMessages demands strict JSON, conservatism, and no duplicates", async () => {
    const { learnerMessages } = await import("@/lib/contentagent/prompts");
    const msgs = learnerMessages({
      run,
      firstOutput: "draft v1",
      finalOutput: "shipped version",
      feedbackNotes: ["shorter"],
      existingLessons: ["Existing rule."],
    });
    expect(msgs[0].content).toContain('{"lessons"');
    expect(msgs[0].content).toContain("conservative");
    expect(msgs[1].content).toContain("Existing rule.");
    expect(msgs[1].content).toContain("shipped version");
  });
});


describe("stripImageMarkers", () => {
  it("removes marker paragraphs and bare markers, keeps the article", async () => {
    const { stripImageMarkers } = await import("@/lib/contentagent/prompts");
    const html = "<h2>How it works</h2>\n<p>First answer.</p>\n<p>[IMAGE 1]</p>\n[IMAGE 2]\n<p>More text [IMAGE 3] inline.</p>";
    const out = stripImageMarkers(html);
    expect(out).not.toMatch(/IMAGE/);
    expect(out).toContain("<h2>How it works</h2>");
    expect(out).toContain("More text  inline.");
  });
});


describe("research contract", () => {
  it("orchestrator gets search rules + researchFindings field when allowed", () => {
    const msgs = orchestratorMessages(run);
    expect(msgs[0].content).toContain("web_search tool available");
    expect(msgs[0].content).toContain("max 3 searches");
    expect(msgs[0].content).toContain("researchFindings");
  });
  it("no research instructions when disabled", () => {
    const noResearch = { ...run, allowResearch: false } as AgentRun;
    const msgs = orchestratorMessages(noResearch);
    expect(msgs[0].content).not.toContain("web_search tool available");
    // JSON contract still includes the field so parsing stays uniform.
    expect(msgs[0].content).toContain("researchFindings");
  });
  it("QA accepts verified findings as number sources and demands attribution", () => {
    const msgs = qaMessages(run, "draft", [{ stat: "42%", source: "Forrester", year: "2026" }]);
    expect(msgs[0].content).toContain("verified research findings");
    expect(msgs[1].content).toContain("Forrester");
  });
  it("writer must attribute research findings", () => {
    const msgs = writerMessages(run, {});
    expect(msgs[0].content).toContain("attribute");
  });
});
