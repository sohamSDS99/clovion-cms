/**
 * Pure unit tests for the course manager helpers: reorder validation +
 * renumbering (buildReorderPlan) and lesson-number assignment
 * (nextLessonNumber / lessonNumberOf). The DB-bound functions are exercised
 * via the API in integration.
 */
import { describe, it, expect } from "vitest";
import {
  buildReorderPlan,
  nextLessonNumber,
  lessonNumberOf,
} from "@/lib/content/courseManager";
import { BadRequestError } from "@/lib/api/http";

const a = "11111111-1111-1111-1111-111111111111";
const b = "22222222-2222-2222-2222-222222222222";
const c = "33333333-3333-3333-3333-333333333333";

describe("buildReorderPlan", () => {
  it("maps the new order to 1-based lesson numbers", () => {
    expect(buildReorderPlan([a, b, c], [c, a, b])).toEqual([
      { id: c, lessonNumber: 1 },
      { id: a, lessonNumber: 2 },
      { id: b, lessonNumber: 3 },
    ]);
  });

  it("rejects a shorter list (missing ids)", () => {
    expect(() => buildReorderPlan([a, b, c], [a, b])).toThrow(BadRequestError);
  });

  it("rejects a longer list", () => {
    expect(() => buildReorderPlan([a, b], [a, b, c])).toThrow(BadRequestError);
  });

  it("rejects duplicate ids (which would also hide a missing one)", () => {
    expect(() => buildReorderPlan([a, b, c], [a, a, b])).toThrow(
      /Duplicate lesson id/
    );
  });

  it("rejects ids that don't belong to the course", () => {
    expect(() => buildReorderPlan([a, b], [a, c])).toThrow(
      /does not belong to this course/
    );
  });

  it("accepts the identity order", () => {
    expect(buildReorderPlan([a], [a])).toEqual([{ id: a, lessonNumber: 1 }]);
  });
});

describe("nextLessonNumber", () => {
  it("appends after the max existing number", () => {
    expect(nextLessonNumber([1, 2, 3])).toBe(4);
  });

  it("is 1 for an empty course", () => {
    expect(nextLessonNumber([])).toBe(1);
  });

  it("survives gaps and unordered input", () => {
    expect(nextLessonNumber([5, 1, 3])).toBe(6);
  });

  it("ignores non-finite garbage", () => {
    expect(nextLessonNumber([Number.NaN, Number.POSITIVE_INFINITY, 2])).toBe(3);
  });
});

describe("lessonNumberOf", () => {
  it("reads lessonNumber from a course typeData payload", () => {
    expect(lessonNumberOf({ courseSlug: "x", lessonNumber: 7 })).toBe(7);
  });

  it("is 0 for missing/malformed typeData", () => {
    expect(lessonNumberOf(null)).toBe(0);
    expect(lessonNumberOf({})).toBe(0);
    expect(lessonNumberOf({ lessonNumber: "3" })).toBe(0);
  });
});


describe("publishActionFor", () => {
  it("maps statuses to the correct lifecycle action", async () => {
    const { publishActionFor } = await import("@/lib/content/courseManager");
    expect(publishActionFor("DRAFT")).toBe("publish_now");
    expect(publishActionFor("IN_REVIEW")).toBe("approve_publish");
    expect(publishActionFor("PUBLISHED")).toBeNull();
  });
});
