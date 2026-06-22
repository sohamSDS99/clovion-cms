import { describe, it, expect } from "vitest";
import {
  assemblePrompt,
  ALLOWED_HTML_TAGS,
  type PromptChunk,
  type PromptSop,
} from "@/lib/ai/prompt";

const sop: PromptSop = {
  id: "sop-1",
  version: 3,
  body: "SOP_BODY_MARKER: write in a friendly, concise voice.",
};

const chunks: PromptChunk[] = [
  { chunkText: "Low relevance chunk.", score: 0.2, kbItemId: "kb-low", sourceTitle: "LowDoc" },
  { chunkText: "High relevance chunk.", score: 0.9, kbItemId: "kb-high", sourceTitle: "HighDoc" },
  { chunkText: "Mid relevance chunk.", score: 0.5, kbItemId: "kb-mid", sourceTitle: "MidDoc" },
];

describe("assemblePrompt — deterministic block order", () => {
  it("emits SYSTEM, SOP, KNOWLEDGE, TASK, FORMAT in that exact order", () => {
    const { messages } = assemblePrompt({
      mode: "full_draft",
      contentType: "BLOG",
      brief: { topic: "AI marketing" },
      sop,
      chunks,
    });

    expect(messages).toHaveLength(5);
    // 1) SYSTEM
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toMatch(/DRAFT ONLY/);
    expect(messages[0].content).toMatch(/do not fabricate|Do NOT fabricate/i);
    // 2) SOP (pinned)
    expect(messages[1].content).toContain("SOP_BODY_MARKER");
    expect(messages[1].content).toContain("sop-1");
    // 3) KNOWLEDGE
    expect(messages[2].content).toMatch(/^KNOWLEDGE BASE/);
    // 4) TASK with OUTPUT CONTRACT
    expect(messages[3].content).toMatch(/OUTPUT CONTRACT/);
    // 5) FORMAT reminder
    expect(messages[4].content).toMatch(/^FORMAT REMINDER/);
  });

  it("is deterministic for identical inputs", () => {
    const args = {
      mode: "full_draft" as const,
      contentType: "BLOG" as const,
      brief: { topic: "AI marketing", keywords: ["seo", "ai"] },
      sop,
      chunks,
    };
    const a = assemblePrompt(args);
    const b = assemblePrompt(args);
    expect(a.messages).toEqual(b.messages);
  });

  it("ranks KB chunks by descending score (most relevant first)", () => {
    const { messages } = assemblePrompt({
      mode: "full_draft",
      contentType: "BLOG",
      brief: { topic: "x" },
      sop,
      chunks,
    });
    const knowledge = messages[2].content;
    const hi = knowledge.indexOf("High relevance");
    const mid = knowledge.indexOf("Mid relevance");
    const lo = knowledge.indexOf("Low relevance");
    expect(hi).toBeGreaterThan(-1);
    expect(hi).toBeLessThan(mid);
    expect(mid).toBeLessThan(lo);
  });

  it("includes every allowed tag in the OUTPUT CONTRACT and excludes disallowed ones", () => {
    const { messages } = assemblePrompt({
      mode: "full_draft",
      contentType: "BLOG",
      brief: { topic: "x" },
      sop,
      chunks,
    });
    const task = messages[3].content;
    for (const tag of ALLOWED_HTML_TAGS) expect(task).toContain(tag);
    expect(task).toMatch(/Do not use h1/i);
  });
});

describe("assemblePrompt — token-overflow handling", () => {
  it("trims lowest-score KB chunks first under budget pressure", () => {
    const { messages, meta } = assemblePrompt({
      mode: "full_draft",
      contentType: "BLOG",
      brief: { topic: "x" },
      sop,
      chunks,
      // Budget that fits the fixed blocks + the two higher-score chunks,
      // forcing only the lowest-score chunk to be trimmed.
      charBudget: 1650,
    });
    expect(meta.chunksDropped).toBeGreaterThan(0);
    const knowledge = messages[2].content;
    // The lowest-score chunk must be dropped before the highest-score one.
    expect(knowledge).not.toContain("Low relevance");
    expect(knowledge).toContain("High relevance");
  });

  it("NEVER drops the SOP or the OUTPUT CONTRACT even under extreme pressure", () => {
    const bigChunks: PromptChunk[] = Array.from({ length: 20 }, (_, i) => ({
      chunkText: "x".repeat(2000),
      score: i / 20,
      kbItemId: `kb-${i}`,
      sourceTitle: `Doc ${i}`,
    }));
    const { messages } = assemblePrompt({
      mode: "full_draft",
      contentType: "BLOG",
      brief: { topic: "y".repeat(5000), outline: "z".repeat(5000) },
      sop,
      chunks: bigChunks,
      charBudget: 500,
    });
    // SOP block and OUTPUT CONTRACT must survive.
    expect(messages[1].content).toContain("SOP_BODY_MARKER");
    expect(messages[3].content).toMatch(/OUTPUT CONTRACT/);
  });

  it("truncates the brief once no KB chunks remain and still over budget", () => {
    const { meta } = assemblePrompt({
      mode: "full_draft",
      contentType: "BLOG",
      brief: { topic: "t".repeat(6000), outline: "o".repeat(6000) },
      sop,
      chunks: [],
      charBudget: 600,
    });
    expect(meta.chunksDropped).toBe(0);
    expect(meta.briefTruncated).toBe(true);
  });

  it("de-duplicates identical chunks keeping the highest score", () => {
    const dupes: PromptChunk[] = [
      { chunkText: "Same text.", score: 0.3, kbItemId: "a" },
      { chunkText: "  same   TEXT. ", score: 0.8, kbItemId: "b" },
    ];
    const { messages } = assemblePrompt({
      mode: "full_draft",
      contentType: "BLOG",
      brief: { topic: "x" },
      sop,
      chunks: dupes,
    });
    const knowledge = messages[2].content;
    const occurrences = knowledge.split(/same\s+text/i).length - 1;
    expect(occurrences).toBe(1);
  });
});

describe("assemblePrompt — mode variations", () => {
  it("section mode targets the named section", () => {
    const { messages } = assemblePrompt({
      mode: "section",
      contentType: "BLOG",
      brief: { sectionName: "Pricing Overview" },
      sop,
      chunks,
    });
    expect(messages[3].content).toContain("Pricing Overview");
    expect(messages[3].content).toMatch(/ONLY the section/);
  });

  it("rewrite mode includes the selected text", () => {
    const { messages } = assemblePrompt({
      mode: "rewrite",
      contentType: "BLOG",
      brief: { selectedText: "REWRITE_ME passage." },
      sop,
      chunks,
    });
    expect(messages[3].content).toContain("REWRITE_ME passage.");
    expect(messages[3].content).toMatch(/rewrite/i);
  });

  it("outline mode asks for headings only and omits the suggested outline echo", () => {
    const { messages } = assemblePrompt({
      mode: "outline",
      contentType: "BLOG",
      brief: { topic: "Topic X", outline: "should-not-echo" },
      sop,
      chunks,
    });
    expect(messages[3].content).toMatch(/outline of headings/i);
    expect(messages[3].content).not.toContain("should-not-echo");
  });

  it("works with a null SOP (uses neutral defaults, never drops the block)", () => {
    const { messages } = assemblePrompt({
      mode: "full_draft",
      contentType: "NEWS",
      brief: { topic: "x" },
      sop: null,
      chunks: [],
    });
    expect(messages).toHaveLength(5);
    expect(messages[1].content).toMatch(/No active SOP/);
    expect(messages[2].content).toMatch(/No grounding context/);
  });
});
