import { describe, expect, it } from "vitest";
import {
  canPerformTransition,
  authorizeTransition,
  type WorkflowPolicy,
} from "@/lib/workflow/permissions";
import type { ContentType, Role, TransitionAction } from "@/lib/workflow/types";

const NO_POLICY: WorkflowPolicy = { selfPublish: false, newsFastPublish: false };
const SELF_PUBLISH: WorkflowPolicy = { selfPublish: true, newsFastPublish: false };
const NEWS_FAST: WorkflowPolicy = { selfPublish: false, newsFastPublish: true };

function can(
  role: Role,
  action: TransitionAction,
  opts: {
    isOwner?: boolean;
    policy?: WorkflowPolicy;
    contentType?: ContentType;
  } = {}
) {
  return canPerformTransition({
    role,
    action,
    isOwner: opts.isOwner ?? false,
    policy: opts.policy ?? NO_POLICY,
    contentType: opts.contentType ?? "BLOG",
  }).allowed;
}

describe("permissions — VIEWER is always denied", () => {
  const actions: TransitionAction[] = [
    "submit",
    "approve_publish",
    "schedule",
    "publish_now",
    "cancel_schedule",
    "unpublish",
    "archive",
    "reject",
    "restore_to_draft",
  ];
  it.each(actions)("VIEWER cannot %s", (action) => {
    expect(can("VIEWER", action, { isOwner: true, policy: SELF_PUBLISH })).toBe(false);
  });
});

describe("permissions — auto_publish is a SYSTEM action (always allowed)", () => {
  it.each(["ADMIN", "EDITOR", "AUTHOR", "CONTRIBUTOR", "VIEWER"] as Role[])(
    "auto_publish allowed regardless of role (%s)",
    (role) => {
      expect(can(role, "auto_publish")).toBe(true);
    }
  );
});

describe("permissions — submit", () => {
  it("Admin/Editor can submit any content", () => {
    expect(can("ADMIN", "submit", { isOwner: false })).toBe(true);
    expect(can("EDITOR", "submit", { isOwner: false })).toBe(true);
  });
  it("Author/Contributor can submit only own content", () => {
    expect(can("AUTHOR", "submit", { isOwner: true })).toBe(true);
    expect(can("AUTHOR", "submit", { isOwner: false })).toBe(false);
    expect(can("CONTRIBUTOR", "submit", { isOwner: true })).toBe(true);
    expect(can("CONTRIBUTOR", "submit", { isOwner: false })).toBe(false);
  });
});

describe("permissions — reject / approve_publish (Admin/Editor only)", () => {
  it.each(["reject", "approve_publish"] as TransitionAction[])(
    "%s",
    (action) => {
      expect(can("ADMIN", action)).toBe(true);
      expect(can("EDITOR", action)).toBe(true);
      expect(can("AUTHOR", action, { isOwner: true, policy: SELF_PUBLISH })).toBe(false);
      expect(can("CONTRIBUTOR", action, { isOwner: true })).toBe(false);
    }
  );
});

describe("permissions — schedule / publish_now", () => {
  it.each(["schedule", "publish_now"] as TransitionAction[])(
    "Admin/Editor always allowed (%s)",
    (action) => {
      expect(can("ADMIN", action)).toBe(true);
      expect(can("EDITOR", action)).toBe(true);
    }
  );

  it.each(["schedule", "publish_now"] as TransitionAction[])(
    "Author needs selfPublish + ownership (%s)",
    (action) => {
      // no policy -> denied even if owner
      expect(can("AUTHOR", action, { isOwner: true, policy: NO_POLICY })).toBe(false);
      // selfPublish on but not owner -> denied
      expect(can("AUTHOR", action, { isOwner: false, policy: SELF_PUBLISH })).toBe(false);
      // selfPublish on and owner -> allowed
      expect(can("AUTHOR", action, { isOwner: true, policy: SELF_PUBLISH })).toBe(true);
    }
  );

  it.each(["schedule", "publish_now"] as TransitionAction[])(
    "Author with newsFastPublish only allowed for NEWS (%s)",
    (action) => {
      expect(
        can("AUTHOR", action, { isOwner: true, policy: NEWS_FAST, contentType: "NEWS" })
      ).toBe(true);
      // newsFastPublish but a BLOG -> denied
      expect(
        can("AUTHOR", action, { isOwner: true, policy: NEWS_FAST, contentType: "BLOG" })
      ).toBe(false);
    }
  );

  it.each(["schedule", "publish_now"] as TransitionAction[])(
    "Contributor never allowed (%s)",
    (action) => {
      expect(
        can("CONTRIBUTOR", action, { isOwner: true, policy: SELF_PUBLISH })
      ).toBe(false);
    }
  );
});

describe("permissions — cancel_schedule", () => {
  it("Admin/Editor always", () => {
    expect(can("ADMIN", "cancel_schedule")).toBe(true);
    expect(can("EDITOR", "cancel_schedule")).toBe(true);
  });
  it("Author needs ownership + policy", () => {
    expect(can("AUTHOR", "cancel_schedule", { isOwner: true, policy: NO_POLICY })).toBe(false);
    expect(can("AUTHOR", "cancel_schedule", { isOwner: false, policy: SELF_PUBLISH })).toBe(false);
    expect(can("AUTHOR", "cancel_schedule", { isOwner: true, policy: SELF_PUBLISH })).toBe(true);
    expect(
      can("AUTHOR", "cancel_schedule", { isOwner: true, policy: NEWS_FAST, contentType: "NEWS" })
    ).toBe(true);
  });
  it("Contributor never", () => {
    expect(can("CONTRIBUTOR", "cancel_schedule", { isOwner: true, policy: SELF_PUBLISH })).toBe(false);
  });
});

describe("permissions — unpublish / archive / restore_to_draft (Admin/Editor only)", () => {
  it.each(["unpublish", "archive", "restore_to_draft"] as TransitionAction[])(
    "%s",
    (action) => {
      expect(can("ADMIN", action)).toBe(true);
      expect(can("EDITOR", action)).toBe(true);
      expect(can("AUTHOR", action, { isOwner: true, policy: SELF_PUBLISH })).toBe(false);
      expect(can("CONTRIBUTOR", action, { isOwner: true })).toBe(false);
    }
  );
});

describe("authorizeTransition — combined 403 vs 409", () => {
  it("403 when state valid but role not permitted", () => {
    // AUTHOR cannot approve_publish; IN_REVIEW->approve_publish IS a valid state move.
    const res = authorizeTransition({
      from: "IN_REVIEW",
      role: "AUTHOR",
      action: "approve_publish",
      isOwner: true,
      policy: SELF_PUBLISH,
      contentType: "BLOG",
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe(403);
  });

  it("409 when state transition invalid (checked before role)", () => {
    // archive from DRAFT is not a valid state transition.
    const res = authorizeTransition({
      from: "DRAFT",
      role: "AUTHOR",
      action: "archive",
      isOwner: true,
      policy: NO_POLICY,
      contentType: "BLOG",
    });
    expect(res.allowed).toBe(false);
    expect(res.code).toBe(409);
  });

  it("409 takes precedence even when role would also be denied", () => {
    // VIEWER + invalid state -> 409 reported first.
    const res = authorizeTransition({
      from: "PUBLISHED",
      role: "VIEWER",
      action: "submit", // invalid from PUBLISHED
      isOwner: false,
      policy: NO_POLICY,
      contentType: "BLOG",
    });
    expect(res.code).toBe(409);
  });

  it("allowed when both gates pass", () => {
    const res = authorizeTransition({
      from: "IN_REVIEW",
      role: "EDITOR",
      action: "approve_publish",
      isOwner: false,
      policy: NO_POLICY,
      contentType: "BLOG",
    });
    expect(res.allowed).toBe(true);
    expect(res.code).toBeUndefined();
  });

  it("Author self-publish path passes both gates", () => {
    const res = authorizeTransition({
      from: "DRAFT",
      role: "AUTHOR",
      action: "publish_now",
      isOwner: true,
      policy: SELF_PUBLISH,
      contentType: "BLOG",
    });
    expect(res.allowed).toBe(true);
  });
});
