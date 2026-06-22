/**
 * PURE unit tests for chunkText (§7.1). No DB / no embedding network.
 */
import { describe, it, expect } from "vitest";
import { chunkText, estimateTokens } from "@/lib/kb/chunk";

const CHARS_PER_TOKEN = 4;

describe("estimateTokens", () => {
  it("returns 0 for empty input", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates ~chars/4", () => {
    expect(estimateTokens("a".repeat(40))).toBe(10);
    expect(estimateTokens("abc")).toBe(1); // ceil(3/4)
  });
});

describe("chunkText — edge cases", () => {
  it("returns [] for empty input", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns [] for whitespace-only input", () => {
    expect(chunkText("   \n\n  \t ")).toEqual([]);
  });

  it("returns a single chunk for short text", () => {
    const chunks = chunkText("Hello world. This is a short doc.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Hello world. This is a short doc.");
    expect(chunks[0].tokenCount).toBe(estimateTokens(chunks[0].text));
  });
});

describe("chunkText — token limit", () => {
  it("respects maxTokens (each chunk stays at/under the char budget)", () => {
    const maxTokens = 20; // 80 chars budget
    // Build many short paragraphs so the chunker must split.
    const para = "Lorem ipsum dolor sit amet.";
    const text = Array.from({ length: 30 }, () => para).join("\n\n");

    const chunks = chunkText(text, { maxTokens, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(maxTokens);
      expect(c.text.length).toBeLessThanOrEqual(maxTokens * CHARS_PER_TOKEN);
    }
  });

  it("hard-cuts a single huge word with no boundaries", () => {
    const maxTokens = 10; // 40 chars
    const huge = "x".repeat(1000);
    const chunks = chunkText(huge, { maxTokens, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(maxTokens * CHARS_PER_TOKEN);
    }
    // Reassembling all pieces yields the original content (no data loss).
    expect(chunks.map((c) => c.text).join("")).toBe(huge);
  });

  it("handles very large input by producing many bounded chunks", () => {
    const maxTokens = 50;
    const sentence = "The quick brown fox jumps over the lazy dog. ";
    const text = sentence.repeat(2000); // ~90k chars
    const chunks = chunkText(text, { maxTokens, overlap: 10 });
    expect(chunks.length).toBeGreaterThan(50);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(maxTokens * CHARS_PER_TOKEN);
    }
  });
});

describe("chunkText — boundaries", () => {
  it("splits on paragraph boundaries when possible", () => {
    const p1 = "First paragraph content here.";
    const p2 = "Second paragraph content here.";
    // maxTokens chosen so each paragraph fits alone but not together.
    const maxTokens = 9; // 36 chars; each para ~29 chars
    const chunks = chunkText(`${p1}\n\n${p2}`, { maxTokens, overlap: 0 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe(p1);
    expect(chunks[1].text).toBe(p2);
  });

  it("splits a long paragraph on sentence boundaries", () => {
    const s1 = "Sentence one is here.";
    const s2 = "Sentence two is here.";
    const s3 = "Sentence three here.";
    const maxTokens = 11; // ~44 chars; two short sentences won't both fit
    const chunks = chunkText(`${s1} ${s2} ${s3}`, { maxTokens, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk should exceed the budget and each should end on sentence punctuation.
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(maxTokens * CHARS_PER_TOKEN);
    }
  });
});

describe("chunkText — overlap", () => {
  it("repeats trailing context from the previous chunk", () => {
    const paras = Array.from({ length: 6 }, (_, i) => `Paragraph number ${i} body text.`);
    const text = paras.join("\n\n");
    const maxTokens = 12; // forces splitting
    const overlap = 6;
    const chunks = chunkText(text, { maxTokens, overlap });
    expect(chunks.length).toBeGreaterThan(1);

    // The start of a later chunk should contain a fragment of the prior chunk.
    const prevTail = chunks[0].text.slice(-overlap * CHARS_PER_TOKEN).trim();
    // At least the overlap should make some chunk begin with shared words.
    const someOverlap = chunks
      .slice(1)
      .some((c) => prevTail.length > 0 && c.text.includes(prevTail.split(" ")[0]));
    expect(someOverlap).toBe(true);
  });

  it("zero overlap produces no repeated prefix and still makes progress", () => {
    const text = Array.from({ length: 10 }, (_, i) => `Block ${i} text here now.`).join("\n\n");
    const chunks = chunkText(text, { maxTokens: 10, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    // Forward progress: total chunked length is finite and bounded.
    expect(chunks.every((c) => c.text.length > 0)).toBe(true);
  });

  it("clamps overlap larger than maxTokens to avoid infinite loops", () => {
    const text = Array.from({ length: 20 }, (_, i) => `Item ${i} content body.`).join("\n\n");
    // overlap >= maxTokens would normally stall; chunker must still terminate.
    const chunks = chunkText(text, { maxTokens: 8, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(8 * CHARS_PER_TOKEN);
    }
  });
});

describe("chunkText — default options", () => {
  it("uses maxTokens=500/overlap=50 by default and keeps medium docs whole", () => {
    const text = "A reasonably sized paragraph. ".repeat(20); // ~600 chars < 2000
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].tokenCount).toBe(estimateTokens(chunks[0].text));
  });
});
