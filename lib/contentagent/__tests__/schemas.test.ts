import { describe, it, expect } from "vitest";
import { createRunSchema } from "@/lib/contentagent/schemas";

const base = {
  channel: "LINKEDIN_PERSONAL" as const,
  postType: "research-insight",
  brief: "A brief that is clearly long enough to pass validation.",
};

describe("createRunSchema — referencedMemoryIds", () => {
  it("accepts a run without referencedMemoryIds (optional)", () => {
    const parsed = createRunSchema.parse(base);
    expect(parsed.referencedMemoryIds).toBeUndefined();
  });
  it("accepts up to 5 uuid references", () => {
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
    const parsed = createRunSchema.parse({ ...base, referencedMemoryIds: ids });
    expect(parsed.referencedMemoryIds).toEqual(ids);
  });
  it("rejects more than 5 references", () => {
    const ids = Array.from({ length: 6 }, () => crypto.randomUUID());
    expect(() =>
      createRunSchema.parse({ ...base, referencedMemoryIds: ids })
    ).toThrow();
  });
  it("rejects non-uuid reference ids", () => {
    expect(() =>
      createRunSchema.parse({ ...base, referencedMemoryIds: ["not-a-uuid"] })
    ).toThrow();
  });
});
