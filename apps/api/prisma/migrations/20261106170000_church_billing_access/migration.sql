-- AlterTable
ALTER TABLE "Church" ADD COLUMN "billingExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "billingGraceUntil" TIMESTAMP(3),
ADD COLUMN "billingNoticeAt" TIMESTAMP(3);

-- El contrato promete 30 días de aviso: las iglesias que ya existen al desplegar los reciben.
UPDATE "Church" SET "billingGraceUntil" = NOW() + INTERVAL '30 days';
