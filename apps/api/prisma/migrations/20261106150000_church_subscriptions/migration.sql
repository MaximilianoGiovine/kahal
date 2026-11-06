-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('MERCADOPAGO', 'PAYPAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ChurchSubscription" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "churchName" TEXT NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "externalId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "currentPeriodEnd" TIMESTAMP(3),
    "lastPaymentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChurchSubscription_externalId_key" ON "ChurchSubscription"("externalId");

-- CreateIndex
CREATE INDEX "ChurchSubscription_churchId_status_idx" ON "ChurchSubscription"("churchId", "status");

-- CreateIndex
CREATE INDEX "ChurchSubscription_status_idx" ON "ChurchSubscription"("status");

-- AddForeignKey
ALTER TABLE "ChurchSubscription" ADD CONSTRAINT "ChurchSubscription_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE SET NULL ON UPDATE CASCADE;
