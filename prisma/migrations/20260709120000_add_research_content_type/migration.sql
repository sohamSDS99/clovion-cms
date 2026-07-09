-- AlterEnum
-- Adds the RESEARCH content type (mirrors BLOG: long-form article, no extra
-- structured fields). Ordered right after BLOG to match schema declaration.
ALTER TYPE "ContentType" ADD VALUE 'RESEARCH' AFTER 'BLOG';
