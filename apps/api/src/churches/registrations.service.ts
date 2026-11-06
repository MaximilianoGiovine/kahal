import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

export class RegistrationsQuery {
  @IsOptional() @Type(() => Number) @IsIn([7, 30, 90]) days: number = 30;
  @IsOptional() @IsString() churchId?: string;
}

@Injectable()
export class RegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cuentas creadas por día, según el calendario de cada iglesia. El día 0 es hoy. */
  async overview(days: number, churchId?: string) {
    // Sin filtro, las iglesias deshabilitadas no cuentan; elegida a mano, sí se puede consultar.
    const scope = churchId ? Prisma.sql`c.id = ${churchId}` : Prisma.sql`c.active`;
    const rows = await this.prisma.$queryRaw<{ day: string; age: number; count: number }[]>`
      WITH r AS (
        SELECT (u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE c.timezone)::date AS day,
               (now() AT TIME ZONE c.timezone)::date - (u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE c.timezone)::date AS age
        FROM "User" u
        JOIN "Church" c ON c.id = u."churchId"
        WHERE NOT u."isSuperAdmin" AND ${scope}
      )
      SELECT to_char(day, 'YYYY-MM-DD') AS day, min(age)::int AS age, count(*)::int AS count
      FROM r
      GROUP BY day
      ORDER BY day`;

    const sum = (test: (age: number) => boolean) => rows.filter((r) => test(r.age)).reduce((total, r) => total + r.count, 0);
    const byDay = new Map(rows.filter((r) => r.age < days).map((r) => [r.day, r.count]));
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    const today = Date.now();
    // Una iglesia al este de UTC ya puede estar en el día siguiente.
    const lastDay = [...byDay.keys()].reduce((a, b) => (b > a ? b : a), iso(today));
    const daily: { day: string; count: number }[] = [];
    for (let t = today - (days - 1) * 86_400_000; iso(t) <= lastDay; t += 86_400_000) {
      daily.push({ day: iso(t), count: byDay.get(iso(t)) ?? 0 });
    }
    return {
      days,
      current: sum((age) => age < days),
      previous: sum((age) => age >= days && age < days * 2),
      /** Cuentas que ya existían al empezar el periodo: la base de la tasa de crecimiento. */
      before: sum((age) => age >= days),
      daily,
    };
  }
}
