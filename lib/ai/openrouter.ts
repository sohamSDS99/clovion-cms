/**
 * Model-agnostic OpenRouter client (§7.3). OpenRouter is the SOLE LLM gateway.
 *
 * This module is intentionally free of env side effects at import time — env is
 * only read lazily inside the factory/methods so it stays safe to import from
 * anywhere (incl. tests that don't touch the network).
 *
 * Generation is NOT wired here — this only provides the transport primitives
 * used by config (`testConnection`/model picker) and the later generation wave.
 */

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/** Reads the configured base URL, trimming any trailing slash. */
function baseUrl(): string {
  return (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** Attribution headers OpenRouter uses for ranking/analytics. */
function attributionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (process.env.OPENROUTER_HTTP_REFERER) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_HTTP_REFERER;
  }
  if (process.env.OPENROUTER_APP_TITLE) {
    headers["X-Title"] = process.env.OPENROUTER_APP_TITLE;
  }
  return headers;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** When true, returns the raw streaming Response for the caller to pipe (SSE). */
  stream?: boolean;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResult {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string | null;
  }>;
  usage?: Usage;
}

export interface OpenRouterModel {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface EmbeddingParams {
  model: string;
  input: string | string[];
}

export interface EmbeddingResult {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: Usage;
}

/** Thrown for any non-2xx OpenRouter response, carrying status + body. */
export class OpenRouterError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`OpenRouter request failed (${status}): ${body}`);
    this.name = "OpenRouterError";
    this.status = status;
    this.body = body;
  }
}

export interface OpenRouterClient {
  listModels(): Promise<OpenRouterModel[]>;
  chatCompletion(params: ChatCompletionParams & { stream: true }): Promise<Response>;
  chatCompletion(
    params: ChatCompletionParams & { stream?: false }
  ): Promise<ChatCompletionResult>;
  createEmbedding(params: EmbeddingParams): Promise<EmbeddingResult>;
}

/**
 * Creates a client bound to a single API key. Pass the decrypted key from
 * `lib/ai/config.ts#getDecryptedKey()` on the server only.
 *
 * TODO(phase2): wrap fetch with retry/backoff on 429/5xx for the generation wave.
 */
export function createOpenRouterClient(apiKey: string): OpenRouterClient {
  function authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      ...attributionHeaders(),
    };
  }

  async function ensureOk(res: Response): Promise<Response> {
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new OpenRouterError(res.status, body);
    }
    return res;
  }

  return {
    async listModels(): Promise<OpenRouterModel[]> {
      const res = await fetch(`${baseUrl()}/models`, {
        method: "GET",
        headers: authHeaders(),
      });
      await ensureOk(res);
      const json = (await res.json()) as { data?: OpenRouterModel[] };
      return json.data ?? [];
    },

    // Overloaded: stream:true -> raw Response (SSE), otherwise parsed JSON.
    chatCompletion(params: ChatCompletionParams): Promise<Response | ChatCompletionResult> {
      const { model, messages, temperature, maxTokens, stream } = params;
      const body = {
        model,
        messages,
        ...(temperature !== undefined ? { temperature } : {}),
        ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
        ...(stream ? { stream: true } : {}),
      };
      const request = fetch(`${baseUrl()}/chat/completions`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (stream) {
        // Caller pipes res.body to the client for SSE; still surface non-2xx.
        return request.then((res) => ensureOk(res));
      }
      return request.then(async (res) => {
        await ensureOk(res);
        return (await res.json()) as ChatCompletionResult;
      });
    },

    async createEmbedding(params: EmbeddingParams): Promise<EmbeddingResult> {
      const res = await fetch(`${baseUrl()}/embeddings`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ model: params.model, input: params.input }),
      });
      await ensureOk(res);
      return (await res.json()) as EmbeddingResult;
    },
  } as OpenRouterClient;
}
