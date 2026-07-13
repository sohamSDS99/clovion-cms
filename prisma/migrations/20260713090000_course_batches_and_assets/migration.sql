-- CreateEnum
CREATE TYPE "CourseBatchStatus" AS ENUM ('PLANNING', 'RUNNING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentAssetStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "course_batches" (
    "id" UUID NOT NULL,
    "outlineRunId" UUID NOT NULL,
    "courseTitle" TEXT,
    "syllabus" JSONB,
    "status" "CourseBatchStatus" NOT NULL DEFAULT 'PLANNING',
    "currentLesson" INTEGER NOT NULL DEFAULT 0,
    "lessonRunIds" JSONB NOT NULL DEFAULT '[]',
    "error" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_assets" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "target" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT,
    "status" "AgentAssetStatus" NOT NULL DEFAULT 'PENDING',
    "mediaAssetId" UUID,
    "error" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_batches_outlineRunId_key" ON "course_batches"("outlineRunId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_assets_runId_target_key" ON "agent_assets"("runId", "target");

-- CreateIndex
CREATE INDEX "agent_assets_runId_idx" ON "agent_assets"("runId");
