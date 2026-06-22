-- DropIndex
DROP INDEX "knowledge_base_chunks_embedding_hnsw_idx";

-- CreateTable
CREATE TABLE "org_policy" (
    "id" UUID NOT NULL,
    "selfPublish" BOOLEAN NOT NULL DEFAULT false,
    "newsFastPublish" BOOLEAN NOT NULL DEFAULT true,
    "webinarAutoRecorded" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_policy_pkey" PRIMARY KEY ("id")
);
