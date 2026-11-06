-- AlterTable
ALTER TABLE "Church" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN "deletionScheduledFor" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ChurchRequest" ADD COLUMN "consentVersion" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "consentVersion" TEXT;

-- CreateTable
CREATE TABLE "ChurchAgreement" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "churchId" TEXT,
    "churchName" TEXT NOT NULL,
    "churchSlug" TEXT NOT NULL,
    "churchCity" TEXT,
    "timezone" TEXT,
    "currency" "Currency",
    "signerFirstName" TEXT NOT NULL,
    "signerLastName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "signerPhone" TEXT NOT NULL,
    "signerDocument" TEXT NOT NULL,
    "signerRole" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "contractText" TEXT NOT NULL,
    "contractHash" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "recordHash" TEXT NOT NULL,
    "churchEndedAt" TIMESTAMP(3),
    "retainUntil" TIMESTAMP(3),

    CONSTRAINT "ChurchAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChurchAgreement_requestId_key" ON "ChurchAgreement"("requestId");

-- CreateIndex
CREATE INDEX "ChurchAgreement_churchId_idx" ON "ChurchAgreement"("churchId");

-- CreateIndex
CREATE INDEX "ChurchAgreement_acceptedAt_idx" ON "ChurchAgreement"("acceptedAt");

-- CreateIndex
CREATE INDEX "Church_deletionScheduledFor_idx" ON "Church"("deletionScheduledFor");

-- AddForeignKey
ALTER TABLE "ChurchAgreement" ADD CONSTRAINT "ChurchAgreement_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ChurchRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchAgreement" ADD CONSTRAINT "ChurchAgreement_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE SET NULL ON UPDATE CASCADE;
