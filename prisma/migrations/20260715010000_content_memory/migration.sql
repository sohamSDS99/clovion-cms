-- Semantic "content memory" for the Content Agent: approved runs + published
-- CMS items, embedded for topical retrieval and manual reference.
-- The `embedding` column is pgvector (Prisma Unsupported); all reads/writes go
-- through raw SQL. The "vector" extension is already enabled (see init).

-- CreateTable
CREATE TABLE "content_memory" (
    "id" UUID NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "channel" "AgentChannel",
    "postType" TEXT,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_memory_sourceType_sourceId_key" ON "content_memory"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "content_memory_channel_idx" ON "content_memory"("channel");

-- Approximate-nearest-neighbour index for semantic retrieval — HNSW cosine,
-- matching the `embedding <=> $query` ORDER BY used by retrieveMemory().
-- Created via raw SQL because Prisma does not manage vector indexes.
CREATE INDEX IF NOT EXISTS "content_memory_embedding_hnsw_idx"
  ON "content_memory"
  USING hnsw ("embedding" vector_cosine_ops);
