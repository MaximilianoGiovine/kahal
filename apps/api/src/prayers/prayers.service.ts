import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Permission, Prisma, UserStatus } from '@prisma/client';
import { AuthUser, can } from '../common/auth-user';
import { LOCALE } from '../common/locale';
import { paginate } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { PrayerFilter, PrayerRequestDto, PrayersQuery, PrayerUpdateDto } from './prayers.dto';

/** Lo que se copia de una vez. Más que esto no entra cómodo en un mensaje. */
const COPY_LIMIT = 500;

const SELECT = {
  id: true,
  userId: true,
  authorName: true,
  body: true,
  shared: true,
  anonymous: true,
  answeredAt: true,
  archivedAt: true,
  createdAt: true,
} satisfies Prisma.PrayerRequestSelect;
type Row = Prisma.PrayerRequestGetPayload<{ select: typeof SELECT }>;

const isTeam = (u: AuthUser) => can(u, Permission.PRAYER_MANAGE);

/**
 * Peticiones de oración. Cada persona registra las suyas y elige si las comparte con la congregación y si muestra su nombre.
 * El equipo (PRAYER_MANAGE) ve todas, con nombre, y las archiva; cualquiera puede copiar de una vez lo que ve.
 */
@Injectable()
export class PrayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async list(churchId: string, user: AuthUser, q: PrayersQuery) {
    const where = this.where(churchId, user, q);
    const [items, total] = await Promise.all([
      this.prisma.prayerRequest.findMany({ where, select: SELECT, orderBy: { createdAt: 'desc' }, ...paginate(q) }),
      this.prisma.prayerRequest.count({ where }),
    ]);
    return { items: items.map((r) => this.view(r, user)), total, page: q.page, pageSize: q.pageSize, team: isTeam(user) };
  }

  /** Todas las peticiones del filtro en texto, listas para pegar en un mensaje. El nombre de las anónimas nunca va. */
  async text(churchId: string, user: AuthUser, q: PrayerFilter) {
    const [church, rows] = await Promise.all([
      this.prisma.church.findUniqueOrThrow({ where: { id: churchId }, select: { name: true, timezone: true } }),
      this.prisma.prayerRequest.findMany({ where: this.where(churchId, user, q), select: SELECT, orderBy: { createdAt: 'asc' }, take: COPY_LIMIT }),
    ]);
    const day = new Intl.DateTimeFormat(LOCALE, { timeZone: church.timezone, day: 'numeric', month: 'short' });
    const today = new Intl.DateTimeFormat(LOCALE, { timeZone: church.timezone, dateStyle: 'long' }).format(new Date());
    const title = q.view === 'answered' ? 'Peticiones respondidas' : q.view === 'archived' ? 'Peticiones archivadas' : 'Peticiones de oración';
    const lines = [`${title} · ${church.name}`, `${today} · ${rows.length} ${rows.length === 1 ? 'petición' : 'peticiones'}`, ''];
    rows.forEach((r, i) => {
      const who = r.anonymous ? 'Anónimo' : r.authorName;
      lines.push(`${i + 1}. ${who} (${day.format(r.createdAt).replace('.', '')}): ${r.body.trim().replace(/\s*\n\s*/g, ' ')}`);
    });
    return { text: lines.join('\n'), count: rows.length, truncated: rows.length === COPY_LIMIT };
  }

  async create(churchId: string, user: AuthUser, dto: PrayerRequestDto) {
    const author = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { firstName: true, lastName: true } });
    const row = await this.prisma.prayerRequest.create({
      data: {
        churchId,
        userId: user.id,
        authorName: `${author.firstName} ${author.lastName}`.trim(),
        body: dto.body.trim(),
        shared: dto.shared ?? false,
        anonymous: dto.anonymous ?? false,
      },
      select: SELECT,
    });
    await this.notifyTeam(churchId, user.id);
    return this.view(row, user);
  }

  async update(churchId: string, user: AuthUser, id: string, dto: PrayerUpdateDto) {
    const row = await this.find(churchId, id);
    const own = row.userId === user.id;
    if (!own && !isTeam(user)) throw new ForbiddenException('Solo puedes cambiar tus propias peticiones');
    if (dto.archived !== undefined && !isTeam(user)) throw new ForbiddenException('Solo el equipo de oración archiva peticiones');
    const updated = await this.prisma.prayerRequest.update({
      where: { id },
      data: {
        ...(dto.answered !== undefined && { answeredAt: dto.answered ? (row.answeredAt ?? new Date()) : null }),
        ...(dto.archived !== undefined && { archivedAt: dto.archived ? (row.archivedAt ?? new Date()) : null }),
      },
      select: SELECT,
    });
    return this.view(updated, user);
  }

  async remove(churchId: string, user: AuthUser, id: string) {
    const row = await this.find(churchId, id);
    if (row.userId !== user.id && !isTeam(user)) throw new ForbiddenException('Solo puedes eliminar tus propias peticiones');
    await this.prisma.prayerRequest.delete({ where: { id } });
    return { ok: true };
  }

  private where(churchId: string, user: AuthUser, q: PrayerFilter): Prisma.PrayerRequestWhereInput {
    const state: Prisma.PrayerRequestWhereInput =
      q.view === 'archived' ? { archivedAt: { not: null } } : q.view === 'answered' ? { archivedAt: null, answeredAt: { not: null } } : { archivedAt: null, answeredAt: null };
    return {
      churchId,
      ...state,
      ...(q.days && { createdAt: { gte: new Date(Date.now() - q.days * 86_400_000) } }),
      ...(q.mine && { userId: user.id }),
      // Fuera del equipo: las propias y las compartidas por los demás.
      ...(!isTeam(user) && { AND: [{ OR: [{ userId: user.id }, { shared: true }] }] }),
    };
  }

  /** La congregación no ve quién pidió una anónima; quien la pidió y el equipo sí. */
  private view(row: Row, user: AuthUser) {
    const mine = row.userId === user.id;
    const hidden = row.anonymous && !mine && !isTeam(user);
    return { ...row, mine, userId: hidden ? null : row.userId, authorName: hidden ? null : row.authorName };
  }

  private async find(churchId: string, id: string) {
    const row = await this.prisma.prayerRequest.findFirst({ where: { id, churchId }, select: { userId: true, answeredAt: true, archivedAt: true } });
    if (!row) throw new NotFoundException('Petición no encontrada');
    return row;
  }

  /** Avisa al equipo sin el texto del pedido: la notificación se ve en la pantalla bloqueada. */
  private async notifyTeam(churchId: string, authorId: string) {
    const team = await this.prisma.user.findMany({
      where: {
        churchId,
        status: UserStatus.ACTIVE,
        id: { not: authorId },
        OR: [{ roles: { some: { role: { isAdmin: true } } } }, { campusRestricted: false, roles: { some: { role: { permissions: { has: Permission.PRAYER_MANAGE } } } } }],
      },
      select: { id: true },
    });
    if (!team.length) return;
    const { name } = await this.prisma.church.findUniqueOrThrow({ where: { id: churchId }, select: { name: true } });
    await this.push.sendToUsers(
      team.map((u) => u.id),
      { title: name, body: 'Hay una nueva petición de oración', url: '/app/oracion', tag: 'prayer' },
    );
  }
}
