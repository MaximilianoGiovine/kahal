import { Injectable, Logger } from '@nestjs/common';
import { ActivityAction, ActivityEntity, Prisma } from '@prisma/client';
import { paginate } from '../common/pagination';
import { ROLE_NAMES_SELECT } from '../roles/roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityQuery } from './activity.dto';

export interface ActivityEntry {
  churchId: string;
  userId: string;
  action: ActivityAction;
  entity: ActivityEntity;
  entityId: string;
  title: string;
  detail?: string | null;
}

/**
 * Nombres legibles de los campos editables, para registrar qué cambió en cada edición.
 * Los campos que no figuran aquí no se informan.
 */
const FIELD_LABEL: Record<string, string> = {
  title: 'título',
  body: 'contenido',
  summary: 'resumen',
  description: 'descripción',
  imageKey: 'imagen',
  coverKey: 'portada',
  pinned: 'destacada',
  published: 'publicación',
  location: 'lugar',
  startsAt: 'inicio',
  endsAt: 'fin',
  isPublic: 'visibilidad',
  url: 'link',
  scheduledAt: 'fecha programada',
  isLive: 'en vivo',
  campusId: 'sede',
};

const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v === '' || v === undefined ? null : v);

/** Lista de campos del dto cuyo valor difiere del registro actual ("título, contenido"). */
export function changedFields(current: Record<string, unknown>, dto: object): string | null {
  const changed = Object.entries(dto)
    .filter(([k, v]) => k in FIELD_LABEL && v !== undefined)
    .filter(([k, v]) => {
      const a = norm(current[k]);
      const b = norm(v);
      // Las fechas llegan como string ISO y en la base son Date: se comparan por instante.
      if (typeof a === 'string' && typeof b === 'string' && !isNaN(Date.parse(a)) && !isNaN(Date.parse(b)) && /^\d{4}-/.test(b)) {
        return Date.parse(a) !== Date.parse(b);
      }
      return a !== b;
    })
    .map(([k]) => FIELD_LABEL[k]);
  return changed.length ? changed.join(', ') : null;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Registra un cambio. Nunca hace fallar la operación principal. */
  async log(entry: ActivityEntry) {
    try {
      await this.prisma.activityLog.create({ data: entry });
    } catch (e) {
      this.logger.warn(`No se pudo registrar la actividad: ${e instanceof Error ? e.message : e}`);
    }
  }

  async list(churchId: string, q: ActivityQuery) {
    const where: Prisma.ActivityLogWhereInput = {
      churchId,
      entity: q.entity,
      userId: q.userId,
      ...(q.q && { title: { contains: q.q, mode: 'insensitive' } }),
    };
    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, ...ROLE_NAMES_SELECT } } },
        orderBy: { createdAt: 'desc' },
        ...paginate(q),
      }),
      this.prisma.activityLog.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  /** Personas que hicieron cambios alguna vez (para el filtro). */
  authors(churchId: string) {
    return this.prisma.user.findMany({
      where: { churchId, activity: { some: {} } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    });
  }
}
