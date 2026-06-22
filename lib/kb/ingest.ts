/**
 * Knowledge Base ingestion pipeline (§7.1, FR-SETTINGS-02).
 *
 *   load item -> extractText -> chunkText -> embedChunks -> insert chunk rows
 *
 * The chunk's `embedding` is a pgvector column modeled as Prisma `Unsupported`,
 * so it CANNOT be written through the typed client. We insert it via raw SQL,
 * casting a pgvector literal (`[0.1,0.2,...]::vector`) — see `toVectorLiteral`.
 *
 * Verified against schema.prisma:
 *   table   knowledge_base_chunks
 *   columns id (uuid pk), "kbItemId" (uuid), "chunkText" (text),
 *           embedding (vector(1536)), "tokenCount" (int), "createdAt" (timestamptz)
 *   (KnowledgeBaseChunk has NO updatedAt column.)
 *
 * Item status is set READY on success and FAILED on any error.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/api/http";
import { extractText, type KbSourceType } from "@/lib/kb/extract";
import { chunkText } from "@/lib/kb/chunk";
import { embedChunks, EMBEDDING_DIM } from "@/lib/kb/embed";

export interface IngestResult {
  kbItemId: string;
  chunkCount: number;
  status: "READY" | "FAILED";
}

/**
 * Formats a number[] as a pgvector literal string: `[0.1,0.2,...]`.
 * The caller appends the `::vector` cast in SQL. Rejects non-finite values and
 * dimension mismatches so we never write a malformed/garbage vector.
 */
export function toVectorLiteral(vec: number[]): string {
  if (vec.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${vec.length}.`
    );
  }
  for (const n of vec) {
    if (!Number.isFinite(n)) {
      throw new Error("Embedding contains a non-finite value.");
    }
  }
  return `[${vec.join(",")}]`;
}

/**
 * Runs the full ingestion for one KnowledgeBaseItem. Idempotent: any existing
 * chunks for the item are deleted first so re-index produces a clean set.
 */
export async function ingestItem(kbItemId: string): Promise<IngestResult> {
  const item = await prisma.knowledgeBaseItem.findUnique({
    where: { id: kbItemId },
  });
  if (!item) throw new NotFoundError("Knowledge base item not found.");

  try {
    // 1) Extract plain text from the source.
    const text = await extractText(item.sourceType as KbSourceType, item.rawContent);

    // 2) Chunk it.
    const chunks = chunkText(text);

    // 3) Embed (skip the network call entirely when there is nothing to embed).
    const vectors = chunks.length > 0 ? await embedChunks(chunks) : [];

    // 4) Replace chunk rows in a transaction: clear old, insert new.
    await prisma.$transaction(async (tx) => {
      await tx.knowledgeBaseChunk.deleteMany({ where: { kbItemId } });

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vecLiteral = toVectorLiteral(vectors[i]);
        // Unsupported vector column -> raw SQL with ::vector cast.
        // Parameterized values are bound safely; only the cast is literal SQL.
        await tx.$executeRaw`
          INSERT INTO knowledge_base_chunks
            (id, "kbItemId", "chunkText", embedding, "tokenCount", "createdAt")
          VALUES (
            gen_random_uuid(),
            ${kbItemId}::uuid,
            ${chunk.text},
            ${vecLiteral}::vector,
            ${chunk.tokenCount},
            now()
          )
        `;
      }

      await tx.knowledgeBaseItem.update({
        where: { id: kbItemId },
        data: { status: "READY" },
      });
    });

    return { kbItemId, chunkCount: chunks.length, status: "READY" };
  } catch (err) {
    // Record the failure on the item so the UI can surface it (FR-SETTINGS-02).
    const reason = err instanceof Error ? err.message : "Unknown ingestion error.";
    await prisma.knowledgeBaseItem
      .update({
        where: { id: kbItemId },
        // No dedicated error column on the model; status FAILED is the signal.
        // Reason is logged for operators.
        data: { status: "FAILED" },
      })
      .catch(() => {
        /* item may have been deleted mid-flight — ignore */
      });
    console.error(`[kb] ingestion failed for ${kbItemId}: ${reason}`);
    // Re-throw a typed error so callers/route layer can surface it.
    throw err instanceof Prisma.PrismaClientKnownRequestError || err instanceof Error
      ? err
      : new Error(reason);
  }
}
