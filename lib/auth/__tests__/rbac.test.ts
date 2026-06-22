import { describe, it, expect } from "vitest";

import {
  can,
  assertCan,
  AuthzError,
  type Role,
  type Capability,
  type AuthzContext,
} from "@/lib/auth/rbac";

const ROLES: Role[] = ["ADMIN", "EDITOR", "AUTHOR", "CONTRIBUTOR", "VIEWER"];

/**
 * Expected outcome encoding:
 *  - "full": always true regardless of ctx
 *  - "none": always false
 *  - "own": true only when ctx.isOwner === true
 *  - "own_draft": true only when isOwner && isDraft
 *  - "own_policy": true only when isOwner && (selfPublish || (newsFastPublish && NEWS))
 */
type Expectation = "full" | "none" | "own" | "own_draft" | "own_policy";

const MATRIX: Record<Capability, Record<Role, Expectation>> = {
  create_content: { ADMIN: "full", EDITOR: "full", AUTHOR: "full", CONTRIBUTOR: "full", VIEWER: "none" },
  edit_content: { ADMIN: "full", EDITOR: "full", AUTHOR: "own", CONTRIBUTOR: "own", VIEWER: "none" },
  delete_content: { ADMIN: "full", EDITOR: "full", AUTHOR: "own_draft", CONTRIBUTOR: "none", VIEWER: "none" },
  save_draft: { ADMIN: "full", EDITOR: "full", AUTHOR: "own", CONTRIBUTOR: "own", VIEWER: "none" },
  submit_for_review: { ADMIN: "full", EDITOR: "full", AUTHOR: "own", CONTRIBUTOR: "own", VIEWER: "none" },
  schedule_publish: { ADMIN: "full", EDITOR: "full", AUTHOR: "own_policy", CONTRIBUTOR: "none", VIEWER: "none" },
  publish_now: { ADMIN: "full", EDITOR: "full", AUTHOR: "own_policy", CONTRIBUTOR: "none", VIEWER: "none" },
  unpublish_archive: { ADMIN: "full", EDITOR: "full", AUTHOR: "none", CONTRIBUTOR: "none", VIEWER: "none" },
  use_ai_write: { ADMIN: "full", EDITOR: "full", AUTHOR: "full", CONTRIBUTOR: "full", VIEWER: "none" },
  upload_media: { ADMIN: "full", EDITOR: "full", AUTHOR: "full", CONTRIBUTOR: "full", VIEWER: "none" },
  manage_media_library: { ADMIN: "full", EDITOR: "full", AUTHOR: "none", CONTRIBUTOR: "none", VIEWER: "none" },
  edit_writing_sop: { ADMIN: "full", EDITOR: "full", AUTHOR: "none", CONTRIBUTOR: "none", VIEWER: "none" },
  activate_writing_sop: { ADMIN: "full", EDITOR: "none", AUTHOR: "none", CONTRIBUTOR: "none", VIEWER: "none" },
  manage_knowledge_base: { ADMIN: "full", EDITOR: "full", AUTHOR: "none", CONTRIBUTOR: "none", VIEWER: "none" },
  configure_ai_provider: { ADMIN: "full", EDITOR: "none", AUTHOR: "none", CONTRIBUTOR: "none", VIEWER: "none" },
  manage_users: { ADMIN: "full", EDITOR: "none", AUTHOR: "none", CONTRIBUTOR: "none", VIEWER: "none" },
  edit_own_author_profile: { ADMIN: "full", EDITOR: "full", AUTHOR: "full", CONTRIBUTOR: "full", VIEWER: "none" },
  edit_others_author_profile: { ADMIN: "full", EDITOR: "none", AUTHOR: "none", CONTRIBUTOR: "none", VIEWER: "none" },
  view_audit_log: { ADMIN: "full", EDITOR: "full", AUTHOR: "none", CONTRIBUTOR: "none", VIEWER: "none" },
};

// A context that satisfies every conditional ("the most permissive" ctx) so
// that "full"/"own"/"own_draft"/"own_policy" all evaluate true under it.
const PERMISSIVE_CTX: AuthzContext = {
  isOwner: true,
  isDraft: true,
  policy: { selfPublish: true, newsFastPublish: true },
  contentType: "NEWS",
};

function expectedUnderPermissive(exp: Expectation): boolean {
  return exp !== "none";
}

describe("RBAC matrix — full cell coverage", () => {
  const capabilities = Object.keys(MATRIX) as Capability[];

  for (const capability of capabilities) {
    for (const role of ROLES) {
      const exp = MATRIX[capability][role];

      it(`${role} / ${capability}: permissive ctx => ${expectedUnderPermissive(exp)}`, () => {
        expect(can(role, capability, PERMISSIVE_CTX)).toBe(
          expectedUnderPermissive(exp)
        );
      });

      it(`${role} / ${capability}: empty ctx => ${exp === "full"}`, () => {
        // With no context, only "full" cells are allowed; conditional cells
        // (own/own_draft/own_policy) and "none" are all denied.
        expect(can(role, capability, {})).toBe(exp === "full");
      });
    }
  }
});

describe("ownership-gated capabilities", () => {
  const ownCaps: Capability[] = [
    "edit_content",
    "save_draft",
    "submit_for_review",
  ];

  for (const cap of ownCaps) {
    it(`AUTHOR ${cap} requires isOwner`, () => {
      expect(can("AUTHOR", cap, { isOwner: true })).toBe(true);
      expect(can("AUTHOR", cap, { isOwner: false })).toBe(false);
      expect(can("AUTHOR", cap, {})).toBe(false);
    });

    it(`CONTRIBUTOR ${cap} requires isOwner`, () => {
      expect(can("CONTRIBUTOR", cap, { isOwner: true })).toBe(true);
      expect(can("CONTRIBUTOR", cap, { isOwner: false })).toBe(false);
    });

    it(`EDITOR/ADMIN ${cap} ignore ownership`, () => {
      expect(can("ADMIN", cap, { isOwner: false })).toBe(true);
      expect(can("EDITOR", cap, { isOwner: false })).toBe(true);
    });
  }
});

describe("delete_content — AUTHOR own + draft-only", () => {
  it("allows AUTHOR only when owner AND draft", () => {
    expect(can("AUTHOR", "delete_content", { isOwner: true, isDraft: true })).toBe(true);
  });
  it("denies AUTHOR when owner but not a draft", () => {
    expect(can("AUTHOR", "delete_content", { isOwner: true, isDraft: false })).toBe(false);
  });
  it("denies AUTHOR when draft but not owner", () => {
    expect(can("AUTHOR", "delete_content", { isOwner: false, isDraft: true })).toBe(false);
  });
  it("denies AUTHOR with empty ctx", () => {
    expect(can("AUTHOR", "delete_content", {})).toBe(false);
  });
  it("CONTRIBUTOR can never delete", () => {
    expect(can("CONTRIBUTOR", "delete_content", { isOwner: true, isDraft: true })).toBe(false);
  });
  it("EDITOR/ADMIN delete unconditionally", () => {
    expect(can("EDITOR", "delete_content", { isOwner: false, isDraft: false })).toBe(true);
    expect(can("ADMIN", "delete_content", { isOwner: false, isDraft: false })).toBe(true);
  });
});

describe("schedule_publish / publish_now — AUTHOR own + policy", () => {
  const caps: Capability[] = ["schedule_publish", "publish_now"];

  for (const cap of caps) {
    it(`${cap}: AUTHOR allowed when owner + selfPublish`, () => {
      expect(
        can("AUTHOR", cap, {
          isOwner: true,
          policy: { selfPublish: true, newsFastPublish: false },
        })
      ).toBe(true);
    });

    it(`${cap}: AUTHOR allowed when owner + newsFastPublish + NEWS`, () => {
      expect(
        can("AUTHOR", cap, {
          isOwner: true,
          policy: { selfPublish: false, newsFastPublish: true },
          contentType: "NEWS",
        })
      ).toBe(true);
    });

    it(`${cap}: AUTHOR denied when newsFastPublish but contentType is not NEWS`, () => {
      expect(
        can("AUTHOR", cap, {
          isOwner: true,
          policy: { selfPublish: false, newsFastPublish: true },
          contentType: "BLOG",
        })
      ).toBe(false);
    });

    it(`${cap}: AUTHOR denied when not owner even with policy`, () => {
      expect(
        can("AUTHOR", cap, {
          isOwner: false,
          policy: { selfPublish: true, newsFastPublish: true },
          contentType: "NEWS",
        })
      ).toBe(false);
    });

    it(`${cap}: AUTHOR denied when no policy provided`, () => {
      expect(can("AUTHOR", cap, { isOwner: true })).toBe(false);
    });

    it(`${cap}: AUTHOR denied when both policy flags false`, () => {
      expect(
        can("AUTHOR", cap, {
          isOwner: true,
          policy: { selfPublish: false, newsFastPublish: false },
          contentType: "NEWS",
        })
      ).toBe(false);
    });

    it(`${cap}: CONTRIBUTOR always denied`, () => {
      expect(
        can("CONTRIBUTOR", cap, {
          isOwner: true,
          policy: { selfPublish: true, newsFastPublish: true },
          contentType: "NEWS",
        })
      ).toBe(false);
    });

    it(`${cap}: EDITOR/ADMIN allowed regardless of policy`, () => {
      expect(can("EDITOR", cap, {})).toBe(true);
      expect(can("ADMIN", cap, {})).toBe(true);
    });
  }
});

describe("writing SOP — edit vs activate separation", () => {
  it("EDITOR can edit the writing SOP", () => {
    expect(can("EDITOR", "edit_writing_sop")).toBe(true);
  });
  it("EDITOR cannot activate the writing SOP", () => {
    expect(can("EDITOR", "activate_writing_sop")).toBe(false);
  });
  it("ADMIN can both edit and activate", () => {
    expect(can("ADMIN", "edit_writing_sop")).toBe(true);
    expect(can("ADMIN", "activate_writing_sop")).toBe(true);
  });
  it("AUTHOR/CONTRIBUTOR/VIEWER cannot edit or activate", () => {
    for (const r of ["AUTHOR", "CONTRIBUTOR", "VIEWER"] as Role[]) {
      expect(can(r, "edit_writing_sop")).toBe(false);
      expect(can(r, "activate_writing_sop")).toBe(false);
    }
  });
});

describe("VIEWER is read-only across every capability", () => {
  const capabilities = Object.keys(MATRIX) as Capability[];
  for (const cap of capabilities) {
    it(`VIEWER denied: ${cap}`, () => {
      expect(can("VIEWER", cap, PERMISSIVE_CTX)).toBe(false);
    });
  }
});

describe("ADMIN is allowed everything", () => {
  const capabilities = Object.keys(MATRIX) as Capability[];
  for (const cap of capabilities) {
    it(`ADMIN allowed: ${cap}`, () => {
      expect(can("ADMIN", cap, {})).toBe(true);
    });
  }
});

describe("assertCan / AuthzError", () => {
  it("does not throw when allowed", () => {
    expect(() => assertCan("ADMIN", "manage_users")).not.toThrow();
  });

  it("throws AuthzError with status 403 when denied", () => {
    let caught: unknown;
    try {
      assertCan("VIEWER", "create_content");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AuthzError);
    expect((caught as AuthzError).status).toBe(403);
    expect((caught as AuthzError).name).toBe("AuthzError");
  });

  it("respects context when asserting conditional capabilities", () => {
    expect(() => assertCan("AUTHOR", "edit_content", { isOwner: true })).not.toThrow();
    expect(() => assertCan("AUTHOR", "edit_content", { isOwner: false })).toThrow(AuthzError);
  });
});
