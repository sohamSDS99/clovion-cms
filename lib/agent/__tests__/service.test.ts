import { describe, it, expect, vi, beforeEach } from "vitest";

const createContent = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/content/service", () => ({ createContent: (...a: unknown[]) => createContent(...a) }));
vi.mock("@/lib/audit/service", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

import { createAgentDraft } from "@/lib/agent/service";
import type { AgentPrincipal } from "@/lib/agent/keys";

const principal: AgentPrincipal = {
  keyId: "11111111-1111-1111-1111-111111111111",
  keyName: "blog-writer",
  scopes: ["content:draft:create"],
  authorProfileId: "33333333-3333-3333-3333-333333333333",
  mintedById: "22222222-2222-2222-2222-222222222222",
};

const input = {
  type: "BLOG" as const,
  title: "Test post",
  bodyHtml: "<p>Hello world.</p>",
};

const createdItem = {
  id: "44444444-4444-4444-4444-444444444444",
  type: "BLOG",
  title: "Test post",
  slug: "test-post",
  status: "DRAFT",
};

beforeEach(() => {
  createContent.mockReset().mockResolvedValue(createdItem);
  recordAudit.mockClear();
});

describe("createAgentDraft", () => {
  it("creates via createContent with AI_GENERATION revision source", async () => {
    const result = await createAgentDraft(principal, input);
    expect(result.status).toBe("DRAFT");
    const [, contentInput, opts] = createContent.mock.calls[0] as [unknown, Record<string, unknown>, Record<string, unknown>];
    expect(opts.revisionSource).toBe("AI_GENERATION");
    expect(contentInput.authorProfileId).toBe(principal.authorProfileId);
    // Body was converted from HTML to a Tiptap doc.
    expect((contentInput.body as { type: string }).type).toBe("doc");
  });

  it("never passes any status/lifecycle field to createContent", async () => {
    await createAgentDraft(principal, input);
    const [, contentInput] = createContent.mock.calls[0] as [unknown, Record<string, unknown>];
    expect("status" in contentInput).toBe(false);
  });

  it("uses the minting admin as the acting identity", async () => {
    await createAgentDraft(principal, input);
    const [actingUser] = createContent.mock.calls[0] as [{ id: string }];
    expect(actingUser.id).toBe(principal.mintedById);
  });

  it("400 when no byline is resolvable", async () => {
    await expect(
      createAgentDraft({ ...principal, authorProfileId: null }, input)
    ).rejects.toMatchObject({ status: 400 });
    expect(createContent).not.toHaveBeenCalled();
  });

  it("400 when the key has no owner", async () => {
    await expect(
      createAgentDraft({ ...principal, mintedById: null }, input)
    ).rejects.toMatchObject({ status: 400 });
  });

  it("records an audit entry identifying the key", async () => {
    await createAgentDraft(principal, input);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "agent_draft_submitted",
        actorId: principal.mintedById,
        diff: expect.objectContaining({ keyId: principal.keyId, via: "agent_api" }),
      })
    );
  });

  it("passes authorProfileId from input over the key default", async () => {
    await createAgentDraft(principal, { ...input, authorProfileId: "55555555-5555-5555-5555-555555555555" });
    const [, contentInput] = createContent.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(contentInput.authorProfileId).toBe("55555555-5555-5555-5555-555555555555");
  });
});
