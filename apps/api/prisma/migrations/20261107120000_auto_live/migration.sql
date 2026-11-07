-- AlterTable
ALTER TABLE "Church" ADD COLUMN "autoLiveEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "ignoredLiveIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "LiveStream" ADD COLUMN "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LiveStream_churchId_platform_externalId_key" ON "LiveStream"("churchId", "platform", "externalId");
