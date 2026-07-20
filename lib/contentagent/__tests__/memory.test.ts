import { describe, it, expect, vi } from "vitest";

// memory.ts imports the prisma singleton + embed at module load; mock them so
// the pure formatter can be imported without a live DB/provider.
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/kb/embed", () => ({ embedOne: vi.fn() }));

import { embeddingToPgvectorLiteral } from "@/lib/contentagent/memory";

describe("embeddingToPgvectorLiteral", () => {
  it("formats a number[] as a bracketed comma-joined pgvector literal", () => {
    expect(embeddingToPgvectorLiteral([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });
  it("handles a single element and negatives", () => {
    expect(embeddingToPgvectorLiteral([-0.5])).toBe("[-0.5]");
  });
  it("produces empty brackets for an empty vector", () => {
    expect(embeddingToPgvectorLiteral([])).toBe("[]");
  });
  it("drops non-finite values so the SQL literal stays valid", () => {
    expect(embeddingToPgvectorLiteral([1, NaN, 2, Infinity, 3])).toBe("[1,2,3]");
  });
  it("preserves integer values without forcing decimals", () => {
    expect(embeddingToPgvectorLiteral([1, 2, 3])).toBe("[1,2,3]");
  });
});
