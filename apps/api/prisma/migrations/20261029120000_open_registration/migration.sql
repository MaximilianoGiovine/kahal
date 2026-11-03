-- El registro de miembros pasa a ser libre: se activan las solicitudes pendientes.

-- Vincula fichas existentes del padrón por email.
UPDATE "Member" m
SET "userId" = match."userId"
FROM (
  SELECT DISTINCT ON (u."id") u."id" AS "userId", x."id" AS "memberId"
  FROM "User" u
  JOIN "Member" x ON x."churchId" = u."churchId" AND x."userId" IS NULL AND lower(x."email") = lower(u."email")
  WHERE u."status" = 'PENDING'
    AND NOT EXISTS (SELECT 1 FROM "Member" y WHERE y."userId" = u."id")
  ORDER BY u."id", x."createdAt"
) match
WHERE m."id" = match."memberId";

-- Crea la ficha como asistente para quienes no tenían una.
INSERT INTO "Member" ("id", "churchId", "userId", "firstName", "lastName", "email", "phone", "status", "joinedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."churchId", u."id", u."firstName", u."lastName", u."email", u."phone", 'ATTENDEE', CURRENT_DATE, now(), now()
FROM "User" u
WHERE u."status" = 'PENDING'
  AND u."churchId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Member" x WHERE x."userId" = u."id");

UPDATE "User" SET "status" = 'ACTIVE' WHERE "status" = 'PENDING';
