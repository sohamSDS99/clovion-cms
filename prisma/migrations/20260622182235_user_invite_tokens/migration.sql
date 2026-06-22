-- AlterTable
ALTER TABLE "users" ADD COLUMN     "inviteToken" TEXT,
ADD COLUMN     "inviteTokenExpires" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_inviteToken_key" ON "users"("inviteToken");

