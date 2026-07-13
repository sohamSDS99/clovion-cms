-- AlterEnum
-- Adds the COURSE content type (a course lesson: article-shaped body plus the
-- course grouping fields — courseSlug/courseTitle/lessonNumber — in typeData).
-- Ordered right after RESOURCE to match schema declaration.
ALTER TYPE "ContentType" ADD VALUE 'COURSE' AFTER 'RESOURCE';
