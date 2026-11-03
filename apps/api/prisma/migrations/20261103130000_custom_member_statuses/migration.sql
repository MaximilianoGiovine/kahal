-- Estados de miembros configurables por iglesia: el enum fijo "MemberStatus" se reemplaza
-- por estados que cada iglesia define. Un miembro puede tener varios.

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'MEMBER_STATUSES_MANAGE';

-- El enum viejo se renombra para liberar el nombre (tablas y tipos comparten espacio de nombres).
ALTER TYPE "MemberStatus" RENAME TO "MemberStatus_old";

-- CreateTable
CREATE TABLE "MemberStatus" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "inactive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberStatusAssignment" (
    "memberId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberStatusAssignment_pkey" PRIMARY KEY ("memberId","statusId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberStatus_churchId_name_key" ON "MemberStatus"("churchId", "name");

-- CreateIndex
CREATE INDEX "MemberStatusAssignment_statusId_idx" ON "MemberStatusAssignment"("statusId");

-- AddForeignKey
ALTER TABLE "MemberStatus" ADD CONSTRAINT "MemberStatus_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberStatusAssignment" ADD CONSTRAINT "MemberStatusAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberStatusAssignment" ADD CONSTRAINT "MemberStatusAssignment_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "MemberStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Estados por defecto de cada iglesia existente, equivalentes a los fijos anteriores
-- (mantener en sync con DEFAULT_MEMBER_STATUSES de src/churches/church-defaults.ts).
ALTER TABLE "MemberStatus" ADD COLUMN "legacyStatus" TEXT;

INSERT INTO "MemberStatus" ("id", "churchId", "name", "color", "position", "isDefault", "inactive", "legacyStatus")
SELECT gen_random_uuid()::text, c."id", d."name", d."color", d."position", d."isDefault", d."inactive", d."legacy"
FROM "Church" c
CROSS JOIN (VALUES
  ('VISITOR', 'Visitante', '#d97706', 0, false, false),
  ('ATTENDEE', 'Asistente', '#64748b', 1, true, false),
  ('MEMBER', 'Miembro', '#4f46e5', 2, false, false),
  ('BAPTIZED', 'Bautizado', '#16a34a', 3, false, false),
  ('INACTIVE', 'Inactivo', '#94a3b8', 4, false, true)
) AS d("legacy", "name", "color", "position", "isDefault", "inactive");

INSERT INTO "MemberStatusAssignment" ("memberId", "statusId")
SELECT m."id", s."id"
FROM "Member" m
JOIN "MemberStatus" s ON s."churchId" = m."churchId" AND s."legacyStatus" = m."status"::text;

ALTER TABLE "MemberStatus" DROP COLUMN "legacyStatus";

-- DropIndex
DROP INDEX "Member_churchId_status_idx";

-- AlterTable
ALTER TABLE "Member" DROP COLUMN "status";

-- DropEnum
DROP TYPE "MemberStatus_old";
