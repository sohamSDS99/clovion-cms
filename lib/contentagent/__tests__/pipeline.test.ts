import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/ai/config", () => ({ getConfig: vi.fn(), getDecryptedKey: vi.fn() }));
vi.mock("@/lib/kb/retrieve", () => ({ retrieveChunks: vi.fn() }));

import { resolveAgentModels } from "@/lib/contentagent/pipeline";
import { DEFAULT_AGENT_MODELS } from "@/lib/contentagent/prompts";

describe("resolveAgentModels", () => {
  it("falls back to defaults when unset", () => {
    expect(resolveAgentModels(undefined)).toEqual(DEFAULT_AGENT_MODELS);
    expect(resolveAgentModels({})).toEqual(DEFAULT_AGENT_MODELS);
  });
  it("applies per-role overrides independently", () => {
    const models = resolveAgentModels({ writer: "anthropic/claude-opus-4.8" });
    expect(models.writer).toBe("anthropic/claude-opus-4.8");
    expect(models.orchestrator).toBe(DEFAULT_AGENT_MODELS.orchestrator);
    expect(models.qa).toBe(DEFAULT_AGENT_MODELS.qa);
  });
  it("ignores empty-string overrides", () => {
    expect(resolveAgentModels({ qa: "" }).qa).toBe(DEFAULT_AGENT_MODELS.qa);
  });
});
