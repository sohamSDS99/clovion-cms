-- AlterTable
ALTER TABLE "ai_provider_configs" ADD COLUMN "agentModels" JSONB NOT NULL DEFAULT '{}';

-- CreateEnum
CREATE TYPE "AgentChannel" AS ENUM ('LINKEDIN_PERSONAL', 'LINKEDIN_COMPANY', 'META_SOCIAL', 'BLOG_ARTICLE', 'REPORT_ARTICLE');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'PLANNING', 'WRITING', 'QA', 'REVISING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "channel" "AgentChannel" NOT NULL,
    "postType" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "sourceReport" TEXT,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "plan" JSONB,
    "draftText" TEXT,
    "qaReport" JSONB,
    "revisionRounds" INTEGER NOT NULL DEFAULT 0,
    "feedback" JSONB NOT NULL DEFAULT '[]',
    "error" JSONB,
    "tokensPrompt" INTEGER NOT NULL DEFAULT 0,
    "tokensCompletion" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "contentId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_runs_status_createdAt_idx" ON "agent_runs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "agent_runs_createdAt_idx" ON "agent_runs"("createdAt");
