-- Manually-referenced past content the writer must stay consistent with.
-- ContentMemory ids the user picked when creating the run.
ALTER TABLE "agent_runs" ADD COLUMN "referencedMemoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
