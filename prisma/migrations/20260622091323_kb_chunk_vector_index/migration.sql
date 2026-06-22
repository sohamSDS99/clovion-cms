-- Approximate-nearest-neighbour index for Knowledge Base retrieval (Phase 2).
-- HNSW with cosine distance, matching the `embedding <=> $query` ORDER BY used
-- by the pgvector similarity search in the AI Writing Engine retrieval service.
-- Created via raw SQL because Prisma does not yet manage vector indexes.
CREATE INDEX IF NOT EXISTS "knowledge_base_chunks_embedding_hnsw_idx"
  ON "knowledge_base_chunks"
  USING hnsw ("embedding" vector_cosine_ops);