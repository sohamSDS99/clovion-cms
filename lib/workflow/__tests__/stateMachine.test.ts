import { describe, expect, it } from "vitest";
import {
  TRANSITIONS,
  getTargetStatus,
  isTransitionAllowed,
  allowedActionsFrom,
} from "@/lib/workflow/stateMachine";
import type { ContentStatus, TransitionAction } from "@/lib/workflow/types";

describe("stateMachine — allowed transitions (FR-CONTENT-08)", () => {
  const allowed: Array<[ContentStatus, TransitionAction, ContentStatus]> = [
    ["DRAFT", "submit", "IN_REVIEW"],
    ["DRAFT", "schedule", "SCHEDULED"],
    ["DRAFT", "publish_now", "PUBLISHED"],
    ["IN_REVIEW", "reject", "DRAFT"],
    ["IN_REVIEW", "schedule", "SCHEDULED"],
    ["IN_REVIEW", "approve_publish", "PUBLISHED"],
    ["IN_REVIEW", "publish_now", "PUBLISHED"],
    ["SCHEDULED", "auto_publish", "PUBLISHED"],
    ["SCHEDULED", "cancel_schedule", "DRAFT"],
    ["SCHEDULED", "unpublish", "UNPUBLISHED"],
    ["PUBLISHED", "unpublish", "UNPUBLISHED"],
    ["PUBLISHED", "archive", "ARCHIVED"],
    ["UNPUBLISHED", "restore_to_draft", "DRAFT"],
    ["UNPUBLISHED", "publish_now", "PUBLISHED"],
    ["UNPUBLISHED", "archive", "ARCHIVED"],
    ["ARCHIVED", "restore_to_draft", "DRAFT"],
  ];

  it.each(allowed)("%s --%s--> %s", (from, action, to) => {
    expect(getTargetStatus(from, action)).toBe(to);
    expect(isTransitionAllowed(from, action)).toBe(true);
  });

  it("has exactly the expected number of transitions", () => {
    const total = Object.values(TRANSITIONS).reduce(
      (n, m) => n + Object.keys(m).length,
      0
    );
    expect(total).toBe(allowed.length);
  });
});

describe("stateMachine — disallowed transitions return null/false", () => {
  const disallowed: Array<[ContentStatus, TransitionAction]> = [
    ["DRAFT", "approve_publish"],
    ["DRAFT", "auto_publish"],
    ["DRAFT", "unpublish"],
    ["DRAFT", "archive"],
    ["DRAFT", "reject"],
    ["IN_REVIEW", "submit"],
    ["IN_REVIEW", "auto_publish"],
    ["IN_REVIEW", "unpublish"],
    ["SCHEDULED", "submit"],
    ["SCHEDULED", "publish_now"],
    ["SCHEDULED", "archive"],
    ["PUBLISHED", "submit"],
    ["PUBLISHED", "schedule"],
    ["PUBLISHED", "auto_publish"],
    ["PUBLISHED", "restore_to_draft"],
    ["UNPUBLISHED", "submit"],
    ["UNPUBLISHED", "schedule"],
    ["UNPUBLISHED", "unpublish"],
    ["ARCHIVED", "publish_now"],
    ["ARCHIVED", "submit"],
    ["ARCHIVED", "archive"],
    ["ARCHIVED", "unpublish"],
  ];

  it.each(disallowed)("%s --%s--> INVALID", (from, action) => {
    expect(getTargetStatus(from, action)).toBeNull();
    expect(isTransitionAllowed(from, action)).toBe(false);
  });
});

describe("stateMachine — allowedActionsFrom", () => {
  const expected: Record<ContentStatus, TransitionAction[]> = {
    DRAFT: ["submit", "schedule", "publish_now"],
    IN_REVIEW: ["reject", "schedule", "approve_publish", "publish_now"],
    SCHEDULED: ["auto_publish", "cancel_schedule", "unpublish"],
    PUBLISHED: ["unpublish", "archive"],
    UNPUBLISHED: ["restore_to_draft", "publish_now", "archive"],
    ARCHIVED: ["restore_to_draft"],
  };

  (Object.keys(expected) as ContentStatus[]).forEach((status) => {
    it(`lists correct actions from ${status}`, () => {
      expect(allowedActionsFrom(status).sort()).toEqual(expected[status].sort());
    });
  });
});
