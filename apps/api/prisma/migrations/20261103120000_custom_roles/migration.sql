-- Roles configurables por iglesia: el enum fijo "Role" se reemplaza por roles
-- que cada iglesia arma con los permisos que elija. Un usuario puede tener varios.

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('MEMBERS_VIEW', 'MEMBERS_EDIT', 'MEMBERS_DELETE', 'FINANCE_VIEW', 'FINANCE_EDIT', 'CONTENT_MANAGE', 'ARTICLES_MANAGE', 'APPOINTMENTS_HOST', 'APPOINTMENTS_ALL', 'USERS_VIEW', 'USERS_MANAGE', 'ROLES_MANAGE', 'CHURCH_SETTINGS', 'ACTIVITY_VIEW');

-- CreateTable
CREATE TABLE "ChurchRole" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" "Permission"[],
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChurchRole_churchId_name_key" ON "ChurchRole"("churchId", "name");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- AddForeignKey
ALTER TABLE "ChurchRole" ADD CONSTRAINT "ChurchRole_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "ChurchRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Roles por defecto de cada iglesia existente, equivalentes a los roles fijos anteriores
-- (mantener en sync con DEFAULT_ROLES de src/churches/church-defaults.ts).
ALTER TABLE "ChurchRole" ADD COLUMN "legacyRole" TEXT;

INSERT INTO "ChurchRole" ("id", "churchId", "name", "description", "permissions", "isAdmin", "updatedAt", "legacyRole")
SELECT gen_random_uuid()::text, c."id", d."name", d."description", d."permissions"::"Permission"[], d."isAdmin", CURRENT_TIMESTAMP, d."legacy"
FROM "Church" c
CROSS JOIN (VALUES
  ('PASTOR', 'Pastor', 'Acceso total a la iglesia', '{}', true),
  ('PASTORAL_TEAM', 'Equipo pastoral', 'Miembros, usuarios, contenido, artículos y recibe citas', '{MEMBERS_VIEW,MEMBERS_EDIT,MEMBERS_DELETE,USERS_VIEW,CONTENT_MANAGE,ARTICLES_MANAGE,APPOINTMENTS_HOST}', false),
  ('LEADER', 'Líder', 'Miembros, contenido, artículos y recibe citas', '{MEMBERS_VIEW,MEMBERS_EDIT,CONTENT_MANAGE,ARTICLES_MANAGE,APPOINTMENTS_HOST}', false),
  ('TREASURER', 'Tesorería', 'Carga y reportes de finanzas', '{FINANCE_VIEW,FINANCE_EDIT}', false),
  ('SECRETARY', 'Secretaría', 'Miembros, usuarios, contenido y artículos', '{MEMBERS_VIEW,MEMBERS_EDIT,MEMBERS_DELETE,USERS_VIEW,CONTENT_MANAGE,ARTICLES_MANAGE}', false)
) AS d("legacy", "name", "description", "permissions", "isAdmin");

INSERT INTO "UserRole" ("userId", "roleId")
SELECT u."id", r."id"
FROM "User" u
JOIN "ChurchRole" r ON r."churchId" = u."churchId" AND r."legacyRole" = u."role"::text;

ALTER TABLE "ChurchRole" DROP COLUMN "legacyRole";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "isSuperAdmin" = true WHERE "role" = 'SUPER_ADMIN';
ALTER TABLE "User" DROP COLUMN "role";

-- DropEnum
DROP TYPE "Role";
