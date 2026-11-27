-- Las pasarelas de pago se reemplazan por donaciones coordinadas a mano: la activación pasa a ser una fecha.
ALTER TABLE "Church" RENAME COLUMN "billingGraceUntil" TO "billingActiveUntil";

-- Lo ya pagado por una pasarela sigue cubierto hasta el final de su período.
UPDATE "Church" c
SET "billingActiveUntil" = s."periodEnd"
FROM (
  SELECT "churchId", MAX("currentPeriodEnd") AS "periodEnd"
  FROM "ChurchSubscription"
  WHERE "churchId" IS NOT NULL AND "currentPeriodEnd" IS NOT NULL
  GROUP BY "churchId"
) s
WHERE s."churchId" = c."id" AND (c."billingActiveUntil" IS NULL OR s."periodEnd" > c."billingActiveUntil");

-- Las iglesias que ya existen tienen al menos 30 días para coordinar su primera donación.
UPDATE "Church"
SET "billingActiveUntil" = NOW() + INTERVAL '30 days'
WHERE "billingExempt" = false AND ("billingActiveUntil" IS NULL OR "billingActiveUntil" < NOW() + INTERVAL '30 days');

UPDATE "Church" SET "billingNoticeAt" = NULL;

-- CreateTable
CREATE TABLE "ChurchDonation" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "churchName" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "currency" "Currency",
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coversUntil" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurchDonation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChurchDonation_churchId_receivedAt_idx" ON "ChurchDonation"("churchId", "receivedAt");

-- CreateIndex
CREATE INDEX "ChurchDonation_receivedAt_idx" ON "ChurchDonation"("receivedAt");

-- AddForeignKey
ALTER TABLE "ChurchDonation" ADD CONSTRAINT "ChurchDonation_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE SET NULL ON UPDATE CASCADE;
