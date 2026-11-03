-- Ficha y cuenta de una misma persona quedan con los mismos datos.
-- El email de la ficha pasa a ser el de ingreso a la app.
UPDATE "Member" m SET "email" = u."email"
FROM "User" u
WHERE m."userId" = u."id" AND m."email" IS DISTINCT FROM u."email";

-- Nombre y teléfono: manda la ficha (la mantiene la iglesia); el teléfono de la cuenta completa si la ficha no tiene.
UPDATE "Member" m SET "phone" = u."phone"
FROM "User" u
WHERE m."userId" = u."id" AND m."phone" IS NULL AND u."phone" IS NOT NULL;

UPDATE "User" u SET "firstName" = m."firstName", "lastName" = m."lastName", "phone" = m."phone"
FROM "Member" m
WHERE m."userId" = u."id"
  AND (u."firstName" IS DISTINCT FROM m."firstName" OR u."lastName" IS DISTINCT FROM m."lastName" OR u."phone" IS DISTINCT FROM m."phone");
