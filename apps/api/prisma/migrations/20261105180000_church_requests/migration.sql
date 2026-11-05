-- CreateEnum
CREATE TYPE "ChurchRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ChurchRequest" (
    "id" TEXT NOT NULL,
    "status" "ChurchRequestStatus" NOT NULL DEFAULT 'PENDING',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "city" TEXT,
    "message" TEXT,
    "adminFirstName" TEXT NOT NULL,
    "adminLastName" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "adminPhone" TEXT NOT NULL,
    "adminPasswordHash" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "churchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChurchRequest_status_createdAt_idx" ON "ChurchRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ChurchRequest" ADD CONSTRAINT "ChurchRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchRequest" ADD CONSTRAINT "ChurchRequest_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE SET NULL ON UPDATE CASCADE;

