import { describe, expect, it } from "vitest";
import { actionsForStatus, canRoleAttempt } from "@/lib/ui/actions";

describe("actionsForStatus", () => {
  it("DRAFT offers submit/schedule/publish", () => {
    const a = actionsForStatus("DRAFT").map((x) => x.action);
    expect(a).toContain("submit");
    expect(a).toContain("schedule");
    expect(a).toContain("publish_now");
  });
  it("IN_REVIEW offers approve/reject", () => {
    const a = actionsForStatus("IN_REVIEW").map((x) => x.action);
    expect(a).toContain("approve_publish");
    expect(a).toContain("reject");
  });
  it("PUBLISHED offers unpublish/archive only", () => {
    const a = actionsForStatus("PUBLISHED").map((x) => x.action);
    expect(a).toEqual(["unpublish", "archive"]);
  });
  it("schedule action is flagged needsSchedule", () => {
    const schedule = actionsForStatus("DRAFT").find((x) => x.action === "schedule");
    expect(schedule?.needsSchedule).toBe(true);
  });
});

describe("canRoleAttempt", () => {
  it("managers may do anything", () => {
    expect(canRoleAttempt("ADMIN", "approve_publish")).toBe(true);
    expect(canRoleAttempt("EDITOR", "archive")).toBe(true);
  });
  it("viewer may do nothing", () => {
    expect(canRoleAttempt("VIEWER", "submit", { isOwner: true })).toBe(false);
  });
  it("author may submit own but not approve", () => {
    expect(canRoleAttempt("AUTHOR", "submit", { isOwner: true })).toBe(true);
    expect(canRoleAttempt("AUTHOR", "submit", { isOwner: false })).toBe(false);
    expect(canRoleAttempt("AUTHOR", "approve_publish", { isOwner: true })).toBe(false);
  });
  it("author may publish own only with self-publish policy", () => {
    expect(canRoleAttempt("AUTHOR", "publish_now", { isOwner: true })).toBe(false);
    expect(
      canRoleAttempt("AUTHOR", "publish_now", { isOwner: true, selfPublish: true })
    ).toBe(true);
  });
  it("contributor cannot publish even when owner+policy", () => {
    expect(
      canRoleAttempt("CONTRIBUTOR", "publish_now", { isOwner: true, selfPublish: true })
    ).toBe(false);
  });
});
