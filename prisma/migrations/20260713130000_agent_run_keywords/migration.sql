-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
