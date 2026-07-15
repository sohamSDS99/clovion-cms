import { describe, it, expect } from "vitest";
import {
  parseJsonOutput,
  extractArticleTitle,
  orchestratorMessages,
  writerMessages,
  qaMessages,
  splitDeliverable,
  joinDeliverable,
  referencesBlock,
} from "@/lib/contentagent/prompts";
import type { AgentRun } from "@prisma/client";

const run = {
  id: "r1",
  channel: "LINKEDIN_PERSONAL",
  postType: "research-insight",
  format: null,
  allowResearch: true,
  keywords: [],
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
    expect(msgs[0].content).toContain("ONE idea");
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


describe("course post types", () => {
  it("course-lesson gets the lesson skeleton + continuity rules", () => {
    const lessonRun = { ...run, channel: "BLOG_ARTICLE", postType: "course-lesson" } as AgentRun;
    const msgs = writerMessages(lessonRun, {});
    expect(msgs[0].content).toContain("Key learnings");
    expect(msgs[0].content).toContain("never re-teach");
    expect(msgs[0].content).toContain("bridging to the next lesson");
  });
  it("course-outline demands a full syllabus structure", () => {
    const outlineRun = { ...run, channel: "BLOG_ARTICLE", postType: "course-outline" } as AgentRun;
    const msgs = writerMessages(outlineRun, {});
    expect(msgs[0].content).toContain("6–8 lessons");
    expect(msgs[0].content).toContain("Assets to produce");
  });
  it("normal articles are unaffected", () => {
    const artRun = { ...run, channel: "BLOG_ARTICLE", postType: "educational-guide" } as AgentRun;
    const msgs = writerMessages(artRun, {});
    expect(msgs[0].content).not.toContain("Key learnings");
  });
});


describe("SEO keywords", () => {
  it("writer gets primary/secondary rules + meta description contract", () => {
    const kwRun = {
      ...run,
      channel: "BLOG_ARTICLE",
      postType: "educational-guide",
      keywords: ["ai visibility tracking", "geo optimization"],
    } as AgentRun;
    const msgs = writerMessages(kwRun, {});
    expect(msgs[1].content).toContain('Primary: "ai visibility tracking"');
    expect(msgs[1].content).toContain('"geo optimization"');
    expect(msgs[1].content).toContain("NEVER stuff");
    expect(msgs[1].content).toContain("metaDescription");
  });
  it("no keyword block when none set", () => {
    const msgs = writerMessages(run, {});
    expect(msgs[1].content).not.toContain("SEO KEYWORDS");
  });
  it("extractArticleMeta pulls title + meta description", async () => {
    const { extractArticleMeta } = await import("@/lib/contentagent/prompts");
    const raw = "<!--title: My Post -->\n<!--metaDescription: The plain answer, with the keyword. -->\n<p>Body</p>";
    const meta = extractArticleMeta(raw);
    expect(meta.title).toBe("My Post");
    expect(meta.metaDescription).toBe("The plain answer, with the keyword.");
    expect(meta.body.trim()).toBe("<p>Body</p>");
  });
});


describe("negative parallelism guard", () => {
  it("writer carries the hard limit in every channel", () => {
    const msgs = writerMessages(run, {});
    expect(msgs[0].content).toContain("NEGATIVE PARALLELISM");
    expect(msgs[0].content).toContain("NEGATIVE PARALLELISM — HARD LIMIT");
    const artRun = { ...run, channel: "BLOG_ARTICLE", postType: "educational-guide" } as AgentRun;
    expect(writerMessages(artRun, {})[0].content).toContain("NEGATIVE PARALLELISM");
  });
  it("QA counts instances and fails on more than one", () => {
    const msgs = qaMessages(run, "draft");
    expect(msgs[0].content).toContain("MORE THAN ONE in the piece = required fix");
  });
});


describe("customer-first framing", () => {
  it("every channel's writer carries the framing rule with both examples", () => {
    const msgs = writerMessages(run, {});
    expect(msgs[0].content).toContain("CUSTOMER-FIRST FRAMING");
    expect(msgs[0].content).toContain("stake → mechanism → evidence");
    expect(msgs[0].content).toContain("Your buyers don't all use the same AI");
    expect(msgs[0].content).toContain("from 90% to 28%");
  });
  it("orchestrator plans keyPoints as customer problems", () => {
    const msgs = orchestratorMessages(run);
    expect(msgs[0].content).toContain("READER'S business problem");
  });
  it("QA enforces the so-what test", () => {
    const msgs = qaMessages(run, "draft");
    expect(msgs[0].content).toContain("CUSTOMER-FIRST FRAMING");
    expect(msgs[0].content).toContain('"so what?"');
  });
});


describe("carousel discipline", () => {
  it("carousel format enforces budgets, one number per slide, no labels, arc", () => {
    const carRun = { ...run, channel: "LINKEDIN_COMPANY", format: "carousel" } as AgentRun;
    const msgs = writerMessages(carRun, {});
    expect(msgs[0].content).toContain("WORD BUDGETS");
    expect(msgs[0].content).toContain("heading \u22646 words + body \u226425 words");
    expect(msgs[0].content).toContain("NO LABELS");
    expect(msgs[0].content).toContain("AT MOST ONE number per slide");
    expect(msgs[0].content).toContain("NEVER repeat a statistic");
    expect(msgs[0].content).toContain("THE ARC");
  });
  it("QA fails carousels that break the slide rules incl. word budgets", () => {
    const msgs = qaMessages(run, "draft");
    expect(msgs[0].content).toContain("CAROUSELS/SLIDES specifically");
    expect(msgs[0].content).toContain("reordered without breaking the flow");
    expect(msgs[0].content).toContain("busts its word budget");
  });
});


describe("platform-aware design prompts", () => {
  it("LinkedIn carousels target 4:5 PDF document pages", async () => {
    const { buildDesignPrompt } = await import("@/lib/contentagent/designPrompt");
    const p = buildDesignPrompt({ ...run, channel: "LINKEDIN_COMPANY", format: "carousel", specText: "SLIDE 1: X" } as never);
    expect(p).toContain("1080×1350");
    expect(p).toContain("multi-page PDF");
  });
  it("Instagram gets the 3:4 grid safe zone on singles and carousels", async () => {
    const { buildDesignPrompt } = await import("@/lib/contentagent/designPrompt");
    const single = buildDesignPrompt({ ...run, channel: "INSTAGRAM", format: "infographic", specText: "TITLE: X" } as never);
    const car = buildDesignPrompt({ ...run, channel: "INSTAGRAM", format: "carousel", specText: "SLIDE 1: X" } as never);
    expect(single).toContain("3:4");
    expect(car).toContain("identical on every slide");
    expect(car).toContain("3:4 safe zone");
  });
  it("Facebook carousels are 1:1 squares", async () => {
    const { buildDesignPrompt } = await import("@/lib/contentagent/designPrompt");
    const p = buildDesignPrompt({ ...run, channel: "FACEBOOK", format: "carousel", specText: "SLIDE 1: X" } as never);
    expect(p).toContain("1080×1080");
  });
});


describe("size selection", () => {
  it("size options are platform-correct", async () => {
    const { sizeOptionsFor, isValidSize } = await import("@/lib/contentagent/sizes");
    expect(sizeOptionsFor("LINKEDIN_COMPANY", "infographic")!.map((s) => s.id)).toEqual([
      "1080x1350", "1080x1080", "1200x627",
    ]);
    expect(sizeOptionsFor("INSTAGRAM", "carousel")!.map((s) => s.id)).toEqual([
      "1080x1350", "1080x1080",
    ]);
    expect(sizeOptionsFor("FACEBOOK", "carousel")![0].id).toBe("1080x1080");
    expect(sizeOptionsFor("LINKEDIN_COMPANY", "static")).toBeNull();
    expect(isValidSize("INSTAGRAM", "carousel", "1200x627")).toBe(false);
  });
  it("orchestrator is asked to recommend only when auto", () => {
    const autoRun = { ...run, channel: "LINKEDIN_COMPANY", format: "infographic", designSize: null } as AgentRun;
    expect(orchestratorMessages(autoRun)[0].content).toContain("recommendedSize");
    const fixedRun = { ...autoRun, designSize: "1080x1080" } as AgentRun;
    expect(orchestratorMessages(fixedRun)[0].content).not.toContain("ARTBOARD SIZE:");
  });
  it("design prompt uses the chosen size", async () => {
    const { buildDesignPrompt } = await import("@/lib/contentagent/designPrompt");
    const p = buildDesignPrompt({ ...run, channel: "LINKEDIN_COMPANY", format: "infographic", designSize: "1080x1080", specText: "TITLE: X" } as never);
    expect(p).toContain("1080×1080");
    expect(p).not.toContain("1080×1350");
  });
});


describe("title rules", () => {
  it("articles carry the buyer-intent title rules with examples", () => {
    const artRun = { ...run, channel: "BLOG_ARTICLE", postType: "educational-guide" } as AgentRun;
    const msgs = writerMessages(artRun, {});
    expect(msgs[0].content).toContain("TITLES (the customer-first rule");
    expect(msgs[0].content).toContain("which number to trust");
    expect(msgs[0].content).toContain("(+ template)");
  });
  it("course outlines demand learner-question lesson titles", () => {
    const outRun = { ...run, channel: "BLOG_ARTICLE", postType: "course-outline" } as AgentRun;
    const msgs = writerMessages(outRun, {});
    expect(msgs[0].content).toContain("THE LEARNER would ask");
    expect(msgs[0].content).toContain("Never name the course after our method");
  });
  it("QA rejects titles the buyer wouldn't type or feel", () => {
    const msgs = qaMessages(run, "draft");
    expect(msgs[0].content).toContain("TITLES");
    expect(msgs[0].content).toContain("required fix with a rewrite suggestion");
  });
});


describe("weighted article QA rubric", () => {
  it("articles get the weighted rubric with publish-or-kill", () => {
    const artRun = { ...run, channel: "BLOG_ARTICLE", postType: "educational-guide" } as AgentRun;
    const msgs = qaMessages(artRun, "draft");
    expect(msgs[0].content).toContain("WEIGHTED RUBRIC");
    expect(msgs[0].content).toContain("informationGain (20%)");
    expect(msgs[0].content).toContain("PUBLISH-OR-KILL");
    expect(msgs[0].content).toContain("weightedScore \u2265 75");
    expect(msgs[0].content).toContain("uniqueness");
  });
  it("captions keep the 30-second-checklist contract", () => {
    const msgs = qaMessages(run, "draft");
    expect(msgs[0].content).toContain("soundsHuman");
    expect(msgs[0].content).not.toContain("WEIGHTED RUBRIC");
  });
  it("hard checks survive on both paths", () => {
    const artRun = { ...run, channel: "BLOG_ARTICLE", postType: "opinion" } as AgentRun;
    for (const r of [run, artRun]) {
      const c = qaMessages(r as AgentRun, "draft")[0].content;
      expect(c).toContain("FABRICATION");
      expect(c).toContain("NEGATIVE PARALLELISM");
      expect(c).toContain("CUSTOMER-FIRST FRAMING");
    }
  });
});


describe("parseJsonOutput robustness", () => {
  it("ignores stray braces in leading prose and finds the real object", async () => {
    const { parseJsonOutput } = await import("@/lib/contentagent/prompts");
    const raw = 'Let me score {searchIntent} here.\n\n{"pass": true, "weightedScore": 80}';
    expect(parseJsonOutput(raw)).toEqual({ pass: true, weightedScore: 80 });
  });
  it("tolerates trailing commas and // comments", async () => {
    const { parseJsonOutput } = await import("@/lib/contentagent/prompts");
    const raw = '{\n  "pass": false, // flagged\n  "requiredFixes": ["x",],\n}';
    expect(parseJsonOutput(raw)).toMatchObject({ pass: false });
  });
  it("still strips code fences", async () => {
    const { parseJsonOutput } = await import("@/lib/contentagent/prompts");
    expect(parseJsonOutput('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("throws only when there is truly no object", async () => {
    const { parseJsonOutput } = await import("@/lib/contentagent/prompts");
    expect(() => parseJsonOutput("no json at all")).toThrow();
  });
});


describe("memory / examples block", () => {
  it("renders approved examples with the match-not-copy instruction", async () => {
    const { examplesBlock } = await import("@/lib/contentagent/prompts");
    const block = examplesBlock([{ title: "", text: "Approved caption body." }]);
    expect(block).toContain("PROVEN EXAMPLES");
    expect(block).toContain("Do NOT copy their topic");
    expect(block).toContain("Approved caption body.");
  });
  it("is empty with no examples", async () => {
    const { examplesBlock } = await import("@/lib/contentagent/prompts");
    expect(examplesBlock([])).toBe("");
  });
});

describe("referencesBlock", () => {
  it("returns empty string with no references", () => {
    expect(referencesBlock([])).toBe("");
  });
  it("includes the stay-consistent instruction and the reference text", () => {
    const out = referencesBlock([
      { title: "The 67% constraint", text: "Buyers drop options fast." },
    ]);
    expect(out).toContain("STAY CONSISTENT");
    expect(out).toContain("do NOT contradict or reframe");
    expect(out).toContain("The 67% constraint");
    expect(out).toContain("Buyers drop options fast.");
  });
  it("caps referenced text at 3000 chars per piece", () => {
    const long = "x".repeat(5000);
    const out = referencesBlock([{ title: "T", text: long }]);
    expect(out).toContain("x".repeat(3000));
    expect(out).not.toContain("x".repeat(3001));
  });
  it("caps at 5 references", () => {
    const refs = Array.from({ length: 8 }, (_, i) => ({
      title: `REF_TITLE_${i}`,
      text: `body ${i}`,
    }));
    const out = referencesBlock(refs);
    expect(out).toContain("REF_TITLE_4");
    expect(out).not.toContain("REF_TITLE_5");
  });
});
