-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "firstOutput" TEXT;

-- CreateTable
CREATE TABLE "agent_lessons" (
    "id" UUID NOT NULL,
    "channel" "AgentChannel" NOT NULL,
    "format" TEXT,
    "lesson" TEXT NOT NULL,
    "sourceRunId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_lessons_channel_isActive_createdAt_idx" ON "agent_lessons"("channel", "isActive", "createdAt");
