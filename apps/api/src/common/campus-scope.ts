import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Sedes visibles para la request. `null`: toda la iglesia. Lista vacía: ninguna. */
export type CampusScope = readonly string[] | null;

/** Valor de los filtros para pedir lo que no tiene sede. */
export const NO_CAMPUS = 'none';

type CampusFilter = string | null | { in: string[] } | undefined;

const OUT_OF_SCOPE = 'No tienes acceso a esa sede';

/**
 * Condición sobre `campusId` que combina lo que el usuario puede ver con el filtro pedido.
 * `undefined` significa sin condición, algo que solo ocurre con acceso a toda la iglesia.
 */
export function campusFilter(scope: CampusScope, requested?: string): CampusFilter {
  if (scope === null) return requested === NO_CAMPUS ? null : requested || undefined;
  if (!requested) return { in: [...scope] };
  if (!scope.includes(requested)) throw new ForbiddenException(OUT_OF_SCOPE);
  return requested;
}

/** La misma condición para SQL manual, sobre la columna `a."campusId"`. */
export function campusSql(scope: CampusScope, requested?: string): Prisma.Sql {
  const filter = campusFilter(scope, requested);
  if (filter === undefined) return Prisma.empty;
  if (filter === null) return Prisma.sql`AND a."campusId" IS NULL`;
  if (typeof filter === 'string') return Prisma.sql`AND a."campusId" = ${filter}`;
  return filter.in.length ? Prisma.sql`AND a."campusId" IN (${Prisma.join(filter.in)})` : Prisma.sql`AND FALSE`;
}

/** Falla si el usuario no puede operar sobre esa sede. Lo que no tiene sede es solo para quien ve toda la iglesia. */
export function assertCampusInScope(scope: CampusScope, campusId: string | null) {
  if (scope !== null && (campusId === null || !scope.includes(campusId))) throw new ForbiddenException(OUT_OF_SCOPE);
}

/** Lo compartido por todas las sedes (categorías, ministerios) solo lo cambia quien ve toda la iglesia. */
export function assertWholeChurch(scope: CampusScope) {
  if (scope !== null) throw new ForbiddenException('Esto es común a todas las sedes: solo lo cambia quien gestiona toda la iglesia');
}

/** Sede de un registro nuevo: la pedida o, para quien tiene una sola sede, esa. */
export function campusForNew(scope: CampusScope, requested?: string | null): string | null {
  const campusId = requested ?? (scope?.length === 1 ? scope[0] : null);
  assertCampusInScope(scope, campusId);
  return campusId;
}

/** La sede debe ser de la iglesia, estar habilitada y no archivada (salvo que el registro ya la tenga). */
export async function assertAssignableCampus(
  db: Pick<PrismaClient, 'campus'> | Pick<Prisma.TransactionClient, 'campus'>,
  churchId: string,
  campusId: string | null | undefined,
  current?: string | null,
) {
  if (!campusId || campusId === current) return;
  const campus = await db.campus.findFirst({
    where: { id: campusId, churchId, church: { campusesEnabled: true } },
    select: { active: true },
  });
  if (!campus) throw new BadRequestException('Sede inválida');
  if (!campus.active) throw new BadRequestException('Esa sede está archivada');
}
