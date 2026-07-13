/**
 * Pure unit tests for the course filing helpers: extractKeyLearnings (HTML
 * section split) and humanizeFilename (download labels). The DB-bound filing
 * functions are exercised via the API in integration.
 */
import { describe, it, expect } from "vitest";
import {
  extractKeyLearnings,
  humanizeFilename,
} from "@/lib/contentagent/courseHtml";

describe("extractKeyLearnings", () => {
  const learningsSection =
    "<h2>Key learnings</h2><ul><li>First point</li><li>Second point</li></ul>";

  it("lifts the section out and returns the li texts", () => {
    const html = `<p>Intro.</p><h2>Body</h2><p>Text.</p>${learningsSection}`;
    const result = extractKeyLearnings(html);
    expect(result.keyLearnings).toEqual(["First point", "Second point"]);
    expect(result.bodyWithoutSection).toBe(
      "<p>Intro.</p><h2>Body</h2><p>Text.</p>"
    );
  });

  it("passes HTML through untouched when the section is absent", () => {
    const html = "<p>No learnings here.</p><h2>Summary</h2><p>Done.</p>";
    expect(extractKeyLearnings(html)).toEqual({
      keyLearnings: [],
      bodyWithoutSection: html,
    });
  });

  it('matches the heading case-insensitively ("Key Learnings")', () => {
    const html =
      "<p>Body.</p><h2>Key Learnings</h2><ul><li>Alpha</li></ul>";
    const result = extractKeyLearnings(html);
    expect(result.keyLearnings).toEqual(["Alpha"]);
    expect(result.bodyWithoutSection).toBe("<p>Body.</p>");
  });

  it("keeps a <strong> lead-in as plain text", () => {
    const html =
      "<h2>Key learnings</h2><ul><li><strong>Budget first:</strong> plan the spend</li></ul>";
    const result = extractKeyLearnings(html);
    expect(result.keyLearnings).toEqual(["Budget first: plan the spend"]);
    expect(result.bodyWithoutSection).toBe("");
  });

  it("strips nested tags and collapses whitespace inside items", () => {
    const html =
      '<h2>KEY LEARNINGS</h2><ul><li>Use <a href="/x">links</a>\n  and <em>emphasis</em></li><li>  </li></ul>';
    const result = extractKeyLearnings(html);
    expect(result.keyLearnings).toEqual(["Use links and emphasis"]);
  });

  it("keeps content after the section (e.g. a final Next: paragraph)", () => {
    const html = `<p>Body.</p>${learningsSection}<p>Next: lesson 4 covers pricing.</p>`;
    const result = extractKeyLearnings(html);
    expect(result.keyLearnings).toEqual(["First point", "Second point"]);
    expect(result.bodyWithoutSection).toBe(
      "<p>Body.</p><p>Next: lesson 4 covers pricing.</p>"
    );
  });

  it("tolerates attributes on the h2/ul/li tags", () => {
    const html =
      '<h2 id="kl" class="x">Key learnings</h2><ul class="list"><li data-n="1">Point</li></ul>';
    expect(extractKeyLearnings(html).keyLearnings).toEqual(["Point"]);
  });
});

describe("humanizeFilename", () => {
  it("drops the extension and un-kebabs the stem", () => {
    expect(humanizeFilename("budget-tracker.xlsx")).toBe("Budget tracker");
  });

  it("handles underscores and mixed separators", () => {
    expect(humanizeFilename("weekly_meal-plan_v2.docx")).toBe(
      "Weekly meal plan v2"
    );
  });

  it("falls back to the raw name when the stem is empty", () => {
    expect(humanizeFilename(".xlsx")).toBe(".xlsx");
  });
});


describe("deriveMetaDescription", () => {
  it("returns null for too-short text and trims long text to ~155 chars", async () => {
    const { deriveMetaDescription } = await import("@/lib/contentagent/courseHtml");
    expect(deriveMetaDescription("<p>Too short.</p>")).toBeNull();
    const long = `<p>${"AI engines pick sources differently and your visibility work must follow each engine's source diet. ".repeat(4)}</p>`;
    const out = deriveMetaDescription(long)!;
    expect(out.length).toBeGreaterThanOrEqual(50);
    expect(out.length).toBeLessThanOrEqual(160);
  });
  it("passes through mid-length text untouched", async () => {
    const { deriveMetaDescription } = await import("@/lib/contentagent/courseHtml");
    const text = "A plain answer that is comfortably between fifty and one hundred fifty five characters long for the gate.";
    expect(deriveMetaDescription(`<p>${text}</p>`)).toBe(text);
  });
});
