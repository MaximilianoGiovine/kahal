-- AlterTable
ALTER TABLE "Member" ADD COLUMN "baptized" BOOLEAN;

-- Quien ya tiene fecha de bautismo o el estado "Bautizado" queda marcado como bautizado/a.
UPDATE "Member" m SET "baptized" = true
WHERE m."baptismDate" IS NOT NULL
   OR EXISTS (
     SELECT 1 FROM "MemberStatusAssignment" a
     JOIN "MemberStatus" s ON s."id" = a."statusId"
     WHERE a."memberId" = m."id" AND lower(s."name") = 'bautizado'
   );
