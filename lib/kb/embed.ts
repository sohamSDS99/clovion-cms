/**
 * Knowledge Base embedding (§7.1 ingestion / §7.2 retrieval).
 *
 * Wraps the OpenRouter embedding endpoint. Both the model and the API key are
 * read from the AIProviderConfig singleton (`lib/ai/config.ts`), so embedding
 * dimensionality is controlled in one place (must match the pgvector column,
 * which is `vector(1536)` in the schema).
 */
import { createOpenRouterClient } from "@/lib/ai/openrouter";
import {
  getConfig,
  getDecryptedKey,
  getDecryptedOpenaiKey,
} from "@/lib/ai/config";
import { BadRequestError } from "@/lib/api/http";
import type { TextChunk } from "@/lib/kb/chunk";

/** Default embedding model when the config leaves `embeddingModel` unset. */
const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

/** Dimensionality of the pgvector column (`vector(1536)` in schema.prisma). */
export const EMBEDDING_DIM = 1536;

/** Resolves the embedding client + model, throwing a clear error if unconfigured.
 * Prefers a direct OpenAI key; falls back to the legacy OpenRouter key. */
async function resolveEmbedder(): Promise<{ model: string; embed: (input: string[]) => Promise<number[][]> }> {
  const config = await getConfig();
  const model = config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;

  const openaiKey = await getDecryptedOpenaiKey();
  if (openaiKey) {
    // Direct OpenAI embeddings; strip any gateway-style "openai/" prefix.
    const directModel = model.replace(/^openai\//, "");
    return {
      model: directModel,
      async embed(input: string[]): Promise<number[][]> {
        const res = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({ model: directModel, input }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new BadRequestError(
            `OpenAI embeddings error ${res.status}: ${body.slice(0, 200)}`
          );
        }
        const data = (await res.json()) as {
          data: { index: number; embedding: number[] }[];
        };
        return data.data
          .slice()
          .sort((a, b) => a.index - b.index)
          .map((d) => d.embedding);
      },
    };
  }

  const key = await getDecryptedKey();
  if (!key) {
    throw new BadRequestError(
      "No embedding provider configured. Add an OpenAI API key (or legacy OpenRouter key) in Settings → AI Provider before ingesting."
    );
  }
  const client = createOpenRouterClient(key);
  return {
    model,
    async embed(input: string[]): Promise<number[][]> {
      // OpenRouter's embedding endpoint accepts a batch (string[]) in one call.
      const result = await client.createEmbedding({ model, input });
      // Sort by `index` defensively in case the provider reorders the batch.
      return result.data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    },
  };
}

/** Embeds an arbitrary list of strings (used by retrieval for the query). */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embed } = await resolveEmbedder();
  return embed(texts);
}

/** Embeds a single string (convenience for query embedding). */
export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  if (!vec) throw new BadRequestError("Embedding provider returned no vector.");
  return vec;
}

/**
 * Embeds chunk texts, returning one vector per chunk in the same order.
 * Throws if the provider returns a mismatched count.
 */
export async function embedChunks(chunks: TextChunk[]): Promise<number[][]> {
  if (chunks.length === 0) return [];
  const vectors = await embedTexts(chunks.map((c) => c.text));
  if (vectors.length !== chunks.length) {
    throw new BadRequestError(
      `Embedding count mismatch: expected ${chunks.length}, got ${vectors.length}.`
    );
  }
  return vectors;
}
