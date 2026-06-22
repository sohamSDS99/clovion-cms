/**
 * Knowledge Base similarity retrieval (§7.2, used by the §6.1 AI engine).
 *
 * Embeds the query, then runs a pgvector cosine-distance search via raw SQL
 * (the `embedding` column is Prisma `Unsupported`, so it can't be queried
 * through the typed client).
 *
 * Cosine similarity = `1 - (embedding <=> query)`. We ORDER BY the distance
 * operator (`<=>`, ascending = most similar first) so a vector index
 * (hnsw/ivfflat vector_cosine_ops) can be used, and project the similarity
 * `score` for the caller.
 *
 * `lowGrounding` is true when the best score is below `threshold` — the AI
 * engine uses this to warn that retrieved context is weak (§6.1 edge case).
 */
import { prisma } from "@/lib/db/prisma";
import { embedOne } from "@/lib/kb/embed";
import { toVectorLiteral } from "@/lib/kb/ingest";

export interface RetrieveOptions {
  /** Only consider chunks whose parent item has ANY of these tags. */
  tags?: string[];
  /** Max chunks to return. */
  k?: number;
  /** Similarity below which results are considered low-grounding. */
  threshold?: number;
}

export interface RetrievedChunk {
  chunkText: string;
  score: number;
  kbItemId: string;
}

export interface RetrieveResult {
  chunks: RetrievedChunk[];
  /** True when the top chunk's similarity < threshold (weak context). */
  lowGrounding: boolean;
}

/** Default similarity floor for the low-grounding signal (cosine, 0..1). */
const DEFAULT_THRESHOLD = 0.2;

/** Internal row shape returned by the raw query. */
interface ChunkRow {
  chunkText: string;
  kbItemId: string;
  score: number;
}

/**
 * Returns the top-`k` chunks most similar to `queryText`, plus a low-grounding
 * flag. Returns an empty, low-grounding result for blank queries.
 */
export async function retrieveChunks(
  queryText: string,
  options: RetrieveOptions = {}
): Promise<RetrieveResult> {
  const k = Math.max(1, options.k ?? 8);
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const tags = options.tags?.filter(Boolean) ?? [];

  const query = (queryText ?? "").trim();
  if (!query) return { chunks: [], lowGrounding: true };

  // 1) Embed the query and build a pgvector literal.
  const qVec = await embedOne(query);
  const qLiteral = toVectorLiteral(qVec);

  // 2) Cosine-distance search. Optional tag filter joins the parent item and
  //    uses array overlap (`&&`) against the item's tags[].
  //    All inputs are parameterized; `<=>` is the pgvector distance operator.
  const rows = tags.length
    ? await prisma.$queryRaw<ChunkRow[]>`
        SELECT c."chunkText"  AS "chunkText",
               c."kbItemId"   AS "kbItemId",
               1 - (c.embedding <=> ${qLiteral}::vector) AS score
        FROM knowledge_base_chunks c
        JOIN knowledge_base_items i ON i.id = c."kbItemId"
        WHERE c.embedding IS NOT NULL
          AND i.tags && ${tags}::text[]
        ORDER BY c.embedding <=> ${qLiteral}::vector
        LIMIT ${k}
      `
    : await prisma.$queryRaw<ChunkRow[]>`
        SELECT c."chunkText"  AS "chunkText",
               c."kbItemId"   AS "kbItemId",
               1 - (c.embedding <=> ${qLiteral}::vector) AS score
        FROM knowledge_base_chunks c
        WHERE c.embedding IS NOT NULL
        ORDER BY c.embedding <=> ${qLiteral}::vector
        LIMIT ${k}
      `;

  const chunks: RetrievedChunk[] = rows.map((r) => ({
    chunkText: r.chunkText,
    kbItemId: r.kbItemId,
    // Postgres may return a numeric/string; coerce to number defensively.
    score: typeof r.score === "number" ? r.score : Number(r.score),
  }));

  const topScore = chunks.length ? chunks[0].score : 0;
  const lowGrounding = chunks.length === 0 || topScore < threshold;

  return { chunks, lowGrounding };
}
