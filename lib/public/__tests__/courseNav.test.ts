/**
 * Pure unit tests for the COURSE navigation helper (no DB): ordering by
 * lessonNumber and prev/next computation around the current lesson.
 */
import { describe, expect, it } from "vitest";
import { computeCourseNav, type CourseLesson } from "../courseNav";

const lesson = (n: number, slug: string): CourseLesson => ({
  slug,
  title: `Lesson ${n}`,
  lessonNumber: n,
  excerpt: null,
});

// Deliberately out of order to prove sorting happens here, not upstream.
const unordered = [lesson(3, "waste-disposal"), lesson(1, "ghs-labels"), lesson(2, "storage")];

describe("computeCourseNav", () => {
  it("orders lessons by lessonNumber regardless of input order", () => {
    const nav = computeCourseNav(unordered, "ghs-labels");
    expect(nav.lessons.map((l) => l.slug)).toEqual([
      "ghs-labels",
      "storage",
      "waste-disposal",
    ]);
  });

  it("gives a middle lesson both prev and next", () => {
    const nav = computeCourseNav(unordered, "storage");
    expect(nav.prev).toEqual({ slug: "ghs-labels", title: "Lesson 1" });
    expect(nav.next).toEqual({ slug: "waste-disposal", title: "Lesson 3" });
  });

  it("gives the first lesson no prev", () => {
    const nav = computeCourseNav(unordered, "ghs-labels");
    expect(nav.prev).toBeNull();
    expect(nav.next).toEqual({ slug: "storage", title: "Lesson 2" });
  });

  it("gives the last lesson no next", () => {
    const nav = computeCourseNav(unordered, "waste-disposal");
    expect(nav.prev).toEqual({ slug: "storage", title: "Lesson 2" });
    expect(nav.next).toBeNull();
  });

  it("yields null prev/next (but the ordered list) for an unknown slug", () => {
    const nav = computeCourseNav(unordered, "not-a-lesson");
    expect(nav.prev).toBeNull();
    expect(nav.next).toBeNull();
    expect(nav.lessons).toHaveLength(3);
  });

  it("breaks lessonNumber ties by slug for a stable order", () => {
    const dup = [lesson(1, "b-lesson"), lesson(1, "a-lesson")];
    const nav = computeCourseNav(dup, "a-lesson");
    expect(nav.lessons.map((l) => l.slug)).toEqual(["a-lesson", "b-lesson"]);
    expect(nav.next).toEqual({ slug: "b-lesson", title: "Lesson 1" });
  });

  it("gives a single lesson neither prev nor next", () => {
    const nav = computeCourseNav([lesson(1, "only")], "only");
    expect(nav.prev).toBeNull();
    expect(nav.next).toBeNull();
    expect(nav.lessons).toHaveLength(1);
  });

  it("handles an empty course", () => {
    const nav = computeCourseNav([], "anything");
    expect(nav).toEqual({ lessons: [], prev: null, next: null });
  });

  it("does not mutate its input", () => {
    const input = [...unordered];
    computeCourseNav(input, "storage");
    expect(input.map((l) => l.slug)).toEqual([
      "waste-disposal",
      "ghs-labels",
      "storage",
    ]);
  });
});
