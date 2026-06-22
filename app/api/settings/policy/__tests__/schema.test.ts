/**
 * Pure unit tests for the org-policy PUT body schema (no DB, no auth).
 * FR-CONTENT-08 — accept partial booleans, reject non-boolean / unknown keys.
 */
import { describe, it, expect } from "vitest";
import { updatePolicySchema } from "@/app/api/settings/policy/schema";

describe("updatePolicySchema", () => {
  it("accepts an empty patch (no-op update)", () => {
    expect(updatePolicySchema.safeParse({}).success).toBe(true);
  });

  it("accepts a single boolean toggle", () => {
    const r = updatePolicySchema.safeParse({ selfPublish: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ selfPublish: true });
  });

  it("accepts all three toggles together", () => {
    const r = updatePolicySchema.safeParse({
      selfPublish: false,
      newsFastPublish: true,
      webinarAutoRecorded: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-boolean value", () => {
    expect(updatePolicySchema.safeParse({ selfPublish: "yes" }).success).toBe(false);
  });

  it("rejects a numeric value coerced from boolean-ish input", () => {
    expect(updatePolicySchema.safeParse({ newsFastPublish: 1 }).success).toBe(false);
  });

  it("rejects null for a toggle", () => {
    expect(updatePolicySchema.safeParse({ webinarAutoRecorded: null }).success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      updatePolicySchema.safeParse({ selfPublish: true, bogus: true }).success
    ).toBe(false);
  });
});
