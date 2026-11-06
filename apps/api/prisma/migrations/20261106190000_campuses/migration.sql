-- DropIndex
DROP INDEX "FinanceAccount_churchId_name_key";

-- AlterTable
ALTER TABLE "Church" ADD COLUMN     "campusesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FinanceAccount" ADD COLUMN     "campusId" TEXT;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "campusId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "campusRestricted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCampus" (
    "userId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,

    CONSTRAINT "UserCampus_pkey" PRIMARY KEY ("userId","campusId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campus_churchId_name_key" ON "Campus"("churchId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Campus_id_churchId_key" ON "Campus"("id", "churchId");

-- CreateIndex
CREATE INDEX "UserCampus_campusId_idx" ON "UserCampus"("campusId");

-- CreateIndex
CREATE INDEX "FinanceAccount_churchId_campusId_idx" ON "FinanceAccount"("churchId", "campusId");

-- CreateIndex
CREATE INDEX "Member_churchId_campusId_lastName_idx" ON "Member"("churchId", "campusId", "lastName");

-- AddForeignKey
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCampus" ADD CONSTRAINT "UserCampus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCampus" ADD CONSTRAINT "UserCampus_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_campusId_churchId_fkey" FOREIGN KEY ("campusId", "churchId") REFERENCES "Campus"("id", "churchId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_campusId_churchId_fkey" FOREIGN KEY ("campusId", "churchId") REFERENCES "Campus"("id", "churchId") ON DELETE NO ACTION ON UPDATE CASCADE;


-- El nombre de una cuenta se repite entre sedes ("Caja" en cada una), pero no dentro de una sede
-- ni entre las cuentas generales. Reemplaza al índice único anterior, que era por iglesia.
CREATE UNIQUE INDEX "FinanceAccount_general_name_key" ON "FinanceAccount"("churchId", "name") WHERE "campusId" IS NULL;
CREATE UNIQUE INDEX "FinanceAccount_campus_name_key" ON "FinanceAccount"("campusId", "name") WHERE "campusId" IS NOT NULL;
