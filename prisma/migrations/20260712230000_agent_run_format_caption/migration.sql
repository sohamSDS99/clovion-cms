-- AlterTable
ALTER TABLE "agent_runs" RENAME COLUMN "pillar" TO "format";

-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN "captionText" TEXT;
