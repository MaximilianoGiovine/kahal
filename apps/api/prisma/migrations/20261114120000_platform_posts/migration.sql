-- CreateEnum
CREATE TYPE "PlatformPostKind" AS ENUM ('NEWS', 'NOTICE');

-- CreateTable
CREATE TABLE "PlatformPost" (
    "id" TEXT NOT NULL,
    "kind" "PlatformPostKind" NOT NULL DEFAULT 'NEWS',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "coverKey" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformPost_published_publishedAt_idx" ON "PlatformPost"("published", "publishedAt");

-- AddForeignKey
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
