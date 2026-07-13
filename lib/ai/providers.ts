/**
 * Direct LLM provider clients — Anthropic + OpenAI, no gateway.
 *
 * Routing is by model id: claude-* → Anthropic Messages API,
 * gpt/o-series → OpenAI Chat Completions. Used by the Content Agent pipeline;
 * the legacy in-editor AI Write keeps its OpenRouter path (lib/ai/openrouter).
 *
 * Keys come from AIProviderConfig (encrypted at rest) — never from env, never
 * logged. Direct APIs don't report dollar cost; usage carries tokens only.
 */
import type { ChatMessage, Usage } from "@/lib/ai/openrouter";

export type Provider = "anthropic" | "openai";

export class ProviderError extends Error {
  status?: number;
  provider: Provider;
  constructor(provider: Provider, message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
  }
}

/** Decide which provider serves a model id. */
export function providerForModel(model: string): Provider {
  const m = model.toLowerCase().replace(/^(anthropic|openai)\//, "");
  if (m.startsWith("claude")) return "anthropic";
  if (m.startsWith("gpt") || /^o\d/.test(m)) return "openai";
  throw new ProviderError(
    m.startsWith("claude") ? "anthropic" : "openai",
    `Can't route model "${model}" — use a claude-* (Anthropic) or gpt-*/o* (OpenAI) model id.`
  );
}

/** Strip an optional gateway-style prefix so both id forms work. */
export function normalizeModelId(model: string): string {
  return model.replace(/^(anthropic|openai)\//, "");
}

export interface ChatCompleteArgs {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** Accepted for API compatibility but never transmitted — newer models
   * on both providers reject explicit temperature. */
  temperature?: number;
  /** Enable Anthropic's server-side web search tool (ignored for OpenAI). */
  webSearch?: { maxUses: number };
}

export interface ChatCompleteResult {
  text: string;
  usage: Usage | undefined;
  /** True when the response hit the max-token ceiling (output incomplete). */
  truncated: boolean;
}

export interface ProviderKeys {
  anthropic?: string | null;
  openai?: string | null;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

async function anthropicChat(
  apiKey: string,
  args: ChatCompleteArgs
): Promise<ChatCompleteResult> {
  const system = args.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const messages = args.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    // Note: `temperature` is intentionally not sent — newer Anthropic and
    // OpenAI models reject it, and provider defaults are what we want.
    body: JSON.stringify({
      model: normalizeModelId(args.model),
      max_tokens: args.maxTokens,
      ...(system ? { system } : {}),
      ...(args.webSearch
        ? {
            tools: [
              {
                type: "web_search_20250305",
                name: "web_search",
                max_uses: args.webSearch.maxUses,
              },
            ],
          }
        : {}),
      messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderError(
      "anthropic",
      `Anthropic API error ${res.status}: ${body.slice(0, 300)}`,
      res.status
    );
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  return {
    text,
    truncated: data.stop_reason === "max_tokens",
    usage: data.usage
      ? {
          prompt_tokens: data.usage.input_tokens ?? 0,
          completion_tokens: data.usage.output_tokens ?? 0,
          total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
        }
      : undefined,
  };
}

async function openaiChat(
  apiKey: string,
  args: ChatCompleteArgs
): Promise<ChatCompleteResult> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: normalizeModelId(args.model),
      messages: args.messages,
      max_completion_tokens: args.maxTokens,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderError(
      "openai",
      `OpenAI API error ${res.status}: ${body.slice(0, 300)}`,
      res.status
    );
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    truncated: data.choices?.[0]?.finish_reason === "length",
    usage: data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens ?? 0,
          completion_tokens: data.usage.completion_tokens ?? 0,
          total_tokens: data.usage.total_tokens ?? 0,
        }
      : undefined,
  };
}

/**
 * Complete a chat with whichever provider serves the model.
 * Throws ProviderError with a setup hint when the needed key is missing.
 */
export async function chatComplete(
  keys: ProviderKeys,
  args: ChatCompleteArgs
): Promise<ChatCompleteResult> {
  const provider = providerForModel(args.model);
  const key = provider === "anthropic" ? keys.anthropic : keys.openai;
  if (!key) {
    throw new ProviderError(
      provider,
      provider === "anthropic"
        ? "Anthropic API key is not configured (Settings → AI Provider)."
        : "OpenAI API key is not configured (Settings → AI Provider)."
    );
  }
  return provider === "anthropic" ? anthropicChat(key, args) : openaiChat(key, args);
}

/** Cheap key check: list models on the provider. Returns null on success. */
export async function pingProvider(
  provider: Provider,
  apiKey: string
): Promise<string | null> {
  const url =
    provider === "anthropic"
      ? "https://api.anthropic.com/v1/models"
      : "https://api.openai.com/v1/models";
  const headers: Record<string, string> =
    provider === "anthropic"
      ? { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION }
      : { authorization: `Bearer ${apiKey}` };
  try {
    const res = await fetch(url, { headers });
    if (res.ok) return null;
    return `${provider}: HTTP ${res.status}`;
  } catch (err) {
    return `${provider}: ${err instanceof Error ? err.message : "network error"}`;
  }
}
