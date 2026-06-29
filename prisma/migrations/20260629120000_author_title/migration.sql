-- Add an optional job-title / role field to author profiles, surfaced on the
-- public byline (FR-USER-02 delta).
ALTER TABLE "author_profiles" ADD COLUMN "title" TEXT;
