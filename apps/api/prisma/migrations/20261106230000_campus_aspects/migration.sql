-- CreateEnum
CREATE TYPE "CampusAspect" AS ENUM ('MEMBERS', 'FINANCE', 'ANNOUNCEMENTS', 'EVENTS', 'ARTICLES', 'STREAMS', 'APPOINTMENTS');

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "campusId" TEXT;

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "campusId" TEXT;

-- AlterTable
ALTER TABLE "Church" ADD COLUMN     "campusSeparated" "CampusAspect"[] DEFAULT ARRAY['MEMBERS', 'FINANCE']::"CampusAspect"[];

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "campusId" TEXT;

-- AlterTable
ALTER TABLE "LiveStream" ADD COLUMN     "campusId" TEXT;

-- CreateIndex
CREATE INDEX "Announcement_campusId_idx" ON "Announcement"("campusId");

-- CreateIndex
CREATE INDEX "Article_campusId_idx" ON "Article"("campusId");

-- CreateIndex
CREATE INDEX "Event_campusId_idx" ON "Event"("campusId");

-- CreateIndex
CREATE INDEX "LiveStream_campusId_idx" ON "LiveStream"("campusId");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_campusId_churchId_fkey" FOREIGN KEY ("campusId", "churchId") REFERENCES "Campus"("id", "churchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_campusId_churchId_fkey" FOREIGN KEY ("campusId", "churchId") REFERENCES "Campus"("id", "churchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveStream" ADD CONSTRAINT "LiveStream_campusId_churchId_fkey" FOREIGN KEY ("campusId", "churchId") REFERENCES "Campus"("id", "churchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_campusId_churchId_fkey" FOREIGN KEY ("campusId", "churchId") REFERENCES "Campus"("id", "churchId") ON DELETE NO ACTION ON UPDATE CASCADE;

