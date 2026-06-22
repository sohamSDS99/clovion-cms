-- CreateTable
CREATE TABLE "lead_forms" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_submissions" (
    "id" UUID NOT NULL,
    "leadFormId" UUID NOT NULL,
    "contentId" UUID,
    "email" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_submissions_leadFormId_createdAt_idx" ON "lead_submissions"("leadFormId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_submissions_contentId_idx" ON "lead_submissions"("contentId");

-- CreateIndex
CREATE INDEX "content_items_status_publishedAt_idx" ON "content_items"("status", "publishedAt");

-- AddForeignKey
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_leadFormId_fkey" FOREIGN KEY ("leadFormId") REFERENCES "lead_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
