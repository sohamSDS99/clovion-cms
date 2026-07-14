import { describe, it, expect } from "vitest";
import {
  providerForModel,
  normalizeModelId,
  chatComplete,
  ProviderError,
} from "@/lib/ai/providers";

describe("providerForModel", () => {
  it("routes claude models to Anthropic", () => {
    expect(providerForModel("claude-fable-5")).toBe("anthropic");
    expect(providerForModel("claude-sonnet-5")).toBe("anthropic");
    expect(providerForModel("anthropic/claude-opus-4-8")).toBe("anthropic");
  });
  it("routes gpt/o-series models to OpenAI", () => {
    expect(providerForModel("gpt-5.2")).toBe("openai");
    expect(providerForModel("openai/gpt-4o")).toBe("openai");
    expect(providerForModel("o3-mini")).toBe("openai");
  });
  it("throws on unroutable ids", () => {
    expect(() => providerForModel("gemini-2.5-pro")).toThrow();
  });
});

describe("normalizeModelId", () => {
  it("strips gateway prefixes", () => {
    expect(normalizeModelId("anthropic/claude-sonnet-5")).toBe("claude-sonnet-5");
    expect(normalizeModelId("openai/gpt-5.2")).toBe("gpt-5.2");
    expect(normalizeModelId("claude-fable-5")).toBe("claude-fable-5");
  });
});

describe("chatComplete key gating", () => {
  const args = {
    model: "claude-sonnet-5",
    messages: [{ role: "user" as const, content: "hi" }],
    maxTokens: 100,
  };
  it("fails fast with a setup hint when the Anthropic key is missing", async () => {
    await expect(chatComplete({ openai: "sk-x" }, args)).rejects.toThrow(
      /Anthropic API key is not configured/
    );
  });
  it("fails fast when the OpenAI key is missing for a gpt model", async () => {
    await expect(
      chatComplete({ anthropic: "sk-ant-x" }, { ...args, model: "gpt-5.2" })
    ).rejects.toThrow(/OpenAI API key is not configured/);
  });
  it("throws ProviderError instances", async () => {
    await expect(chatComplete({}, args)).rejects.toBeInstanceOf(ProviderError);
  });
});


describe("filterChatModels", () => {
  it("keeps chat models, drops non-chat ids, dedupes and sorts", async () => {
    const { filterChatModels } = await import("@/lib/ai/providers");
    expect(
      filterChatModels("openai", ["gpt-5.2", "text-embedding-3-small", "whisper-1", "o3-mini", "gpt-5.2", "dall-e-3"])
    ).toEqual(["gpt-5.2", "o3-mini"]);
    expect(filterChatModels("anthropic", ["claude-opus-4-6", "claude-sonnet-5", "not-a-model"])).toEqual([
      "claude-opus-4-6", "claude-sonnet-5",
    ]);
  });
});
