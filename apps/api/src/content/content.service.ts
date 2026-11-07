import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityAction, ActivityEntity, CampusAspect, Permission, Prisma, StreamPlatform } from '@prisma/client';
import { ActivityService, changedFields } from '../activity/activity.service';
import { AuthUser, can } from '../common/auth-user';
import { assertCampusInScope, audienceWhere, campusToSave, ContentAspect } from '../common/campus-scope';
import { paginate } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { AnnouncementDto, AnnouncementsQuery, EventDto, EventsQuery, StreamDto, StreamsQuery } from './content.dto';

const AUTHOR = { select: { id: true, firstName: true, lastName: true } };
const CAMPUS = { select: { id: true, name: true } };

export function detectPlatform(url: string): StreamPlatform {
  const host = new URL(url).hostname.replace(/^www\.|^m\./, '');
  if (['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return StreamPlatform.YOUTUBE;
  if (['facebook.com', 'web.facebook.com', 'fb.watch', 'fb.com'].includes(host)) return StreamPlatform.FACEBOOK;
  if (['twitch.tv', 'player.twitch.tv', 'clips.twitch.tv'].includes(host)) return StreamPlatform.TWITCH;
  return StreamPlatform.OTHER;
}

const isEditor = (u: AuthUser) => can(u, Permission.CONTENT_MANAGE);

/** Una a la vez por iglesia: sin esto, dos que empiezan juntas pueden quedar ambas en vivo o bloquearse entre sí. */
export function takeLiveLock(tx: Prisma.TransactionClient, churchId: string) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${churchId}, 0))`;
}

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly push: PushService,
  ) {}

  // Novedades

  async announcements(churchId: string, user: AuthUser, q: AnnouncementsQuery) {
    const where = { churchId, ...audienceWhere(user.audiences.ANNOUNCEMENTS, q.campusId), ...(!isEditor(user) && { published: true, publishedAt: { lte: new Date() } }) };
    const [items, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        include: { author: AUTHOR, campus: CAMPUS },
        orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
        ...paginate(q),
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async createAnnouncement(churchId: string, user: AuthUser, dto: AnnouncementDto) {
    const campusId = await this.campusToSave(churchId, user, CampusAspect.ANNOUNCEMENTS, dto.campusId);
    const item = await this.prisma.announcement.create({ data: { ...dto, campusId, churchId, authorId: user.id }, include: { author: AUTHOR, campus: CAMPUS } });
    await this.track(churchId, user.id, ActivityAction.CREATE, ActivityEntity.ANNOUNCEMENT, item);
    if (item.published) await this.notifyAnnouncement(churchId, user, item);
    return item;
  }

  async updateAnnouncement(churchId: string, user: AuthUser, id: string, dto: AnnouncementDto) {
    const current = await this.prisma.announcement.findFirst({ where: { id, churchId } });
    if (!current) throw new NotFoundException('Novedad no encontrada');
    const campusId = await this.campusToSave(churchId, user, CampusAspect.ANNOUNCEMENTS, dto.campusId, current);
    // Al publicar un borrador, la fecha de publicación pasa a ser ahora.
    const publishedAt = dto.published && !current.published ? new Date() : undefined;
    const item = await this.prisma.announcement.update({ where: { id }, data: { ...dto, campusId, publishedAt }, include: { author: AUTHOR, campus: CAMPUS } });
    await this.track(churchId, user.id, ActivityAction.UPDATE, ActivityEntity.ANNOUNCEMENT, item, changedFields(current, { ...dto, campusId }));
    if (item.published && !current.published) await this.notifyAnnouncement(churchId, user, item);
    return item;
  }

  async removeAnnouncement(churchId: string, user: AuthUser, id: string) {
    const current = await this.prisma.announcement.findFirst({ where: { id, churchId } });
    if (!current) throw new NotFoundException('Novedad no encontrada');
    assertCampusInScope(user.campusScopes.ANNOUNCEMENTS, current.campusId);
    await this.prisma.announcement.delete({ where: { id } });
    await this.track(churchId, user.id, ActivityAction.DELETE, ActivityEntity.ANNOUNCEMENT, current);
    return { ok: true };
  }

  // Eventos

  events(churchId: string, user: AuthUser, q: EventsQuery) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 24 * 3600 * 1000);
    return this.prisma.event.findMany({
      where: { churchId, ...audienceWhere(user.audiences.EVENTS, q.campusId), startsAt: { gte: from, lte: q.to ? new Date(q.to) : undefined } },
      include: { campus: CAMPUS },
      orderBy: { startsAt: 'asc' },
      take: 200,
    });
  }

  async createEvent(churchId: string, user: AuthUser, dto: EventDto) {
    this.checkRange(dto);
    const campusId = await this.campusToSave(churchId, user, CampusAspect.EVENTS, dto.campusId);
    const item = await this.prisma.event.create({ data: { ...dto, campusId, churchId, createdById: user.id }, include: { campus: CAMPUS } });
    await this.track(churchId, user.id, ActivityAction.CREATE, ActivityEntity.EVENT, item);
    if (item.startsAt > new Date()) await this.notifyChurch(churchId, user, CampusAspect.EVENTS, item, `Nuevo evento: ${item.title}`, '/app/eventos');
    return item;
  }

  async updateEvent(churchId: string, user: AuthUser, id: string, dto: EventDto) {
    this.checkRange(dto);
    const current = await this.prisma.event.findFirst({ where: { id, churchId } });
    if (!current) throw new NotFoundException('Evento no encontrado');
    const campusId = await this.campusToSave(churchId, user, CampusAspect.EVENTS, dto.campusId, current);
    const item = await this.prisma.event.update({ where: { id }, data: { ...dto, campusId }, include: { campus: CAMPUS } });
    await this.track(churchId, user.id, ActivityAction.UPDATE, ActivityEntity.EVENT, item, changedFields(current, { ...dto, campusId }));
    return item;
  }

  async removeEvent(churchId: string, user: AuthUser, id: string) {
    const current = await this.prisma.event.findFirst({ where: { id, churchId } });
    if (!current) throw new NotFoundException('Evento no encontrado');
    assertCampusInScope(user.campusScopes.EVENTS, current.campusId);
    await this.prisma.event.delete({ where: { id } });
    await this.track(churchId, user.id, ActivityAction.DELETE, ActivityEntity.EVENT, current);
    return { ok: true };
  }

  // Transmisiones

  async streams(churchId: string, user: AuthUser, q: StreamsQuery) {
    const visible = { churchId, ...audienceWhere(user.audiences.STREAMS, q.campusId) };
    const [live, upcoming, past] = await Promise.all([
      this.prisma.liveStream.findFirst({ where: { ...visible, isLive: true }, include: { campus: CAMPUS }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.liveStream.findMany({
        where: { ...visible, isLive: false, scheduledAt: { gte: new Date() } },
        include: { campus: CAMPUS },
        orderBy: { scheduledAt: 'asc' },
        take: 10,
      }),
      this.prisma.liveStream.findMany({
        where: { ...visible, isLive: false, OR: [{ scheduledAt: { lt: new Date() } }, { scheduledAt: null }] },
        include: { campus: CAMPUS },
        orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
        take: 30,
      }),
    ]);
    return { live, upcoming, past };
  }

  async createStream(churchId: string, user: AuthUser, dto: StreamDto) {
    const campusId = await this.campusToSave(churchId, user, CampusAspect.STREAMS, dto.campusId);
    const item = await this.prisma.$transaction(async (tx) => {
      if (dto.isLive) await takeLiveLock(tx, churchId);
      if (dto.isLive) await tx.liveStream.updateMany({ where: { churchId, isLive: true, ...this.liveRival(user, campusId ?? null) }, data: { isLive: false } });
      return tx.liveStream.create({ data: { ...dto, campusId, platform: detectPlatform(dto.url), churchId }, include: { campus: CAMPUS } });
    });
    await this.track(churchId, user.id, ActivityAction.CREATE, ActivityEntity.STREAM, item);
    if (item.isLive) await this.notifyLive(churchId, user, item);
    return item;
  }

  async updateStream(churchId: string, user: AuthUser, id: string, dto: StreamDto) {
    const current = await this.ensureStream(churchId, id);
    const campusId = await this.campusToSave(churchId, user, CampusAspect.STREAMS, dto.campusId, current);
    const target = campusId === undefined ? current.campusId : campusId;
    // Si alguien cambia el enlace o la enciende a mano, la detección deja de manejarla.
    const takesOver = dto.url !== current.url || (dto.isLive && !current.isLive);
    const item = await this.prisma.$transaction(async (tx) => {
      if (dto.isLive) await takeLiveLock(tx, churchId);
      if (dto.isLive) await tx.liveStream.updateMany({ where: { churchId, isLive: true, id: { not: id }, ...this.liveRival(user, target) }, data: { isLive: false } });
      return tx.liveStream.update({ where: { id }, data: { ...dto, campusId, platform: detectPlatform(dto.url), ...(takesOver && { externalId: null }) }, include: { campus: CAMPUS } });
    });
    await this.track(churchId, user.id, ActivityAction.UPDATE, ActivityEntity.STREAM, item, changedFields(current, { ...dto, campusId }));
    if (item.isLive && !current.isLive) await this.notifyLive(churchId, user, item);
    return item;
  }

  /** Solo puede haber una transmisión en vivo por iglesia o, si se separan, por sede. */
  async setLive(churchId: string, user: AuthUser, id: string, isLive: boolean) {
    const current = await this.ensureStream(churchId, id);
    assertCampusInScope(user.campusScopes.STREAMS, current.campusId);
    const item = await this.prisma.$transaction(async (tx) => {
      if (isLive) await takeLiveLock(tx, churchId);
      if (isLive) await tx.liveStream.updateMany({ where: { churchId, isLive: true, id: { not: id }, ...this.liveRival(user, current.campusId) }, data: { isLive: false } });
      return tx.liveStream.update({ where: { id }, data: { isLive, ...(isLive && { scheduledAt: new Date(), externalId: null }) }, include: { campus: CAMPUS } });
    });
    await this.track(churchId, user.id, ActivityAction.UPDATE, ActivityEntity.STREAM, item, changedFields(current, { isLive }));
    if (item.isLive && !current.isLive) await this.notifyLive(churchId, user, item);
    return item;
  }

  async removeStream(churchId: string, user: AuthUser, id: string) {
    const current = await this.ensureStream(churchId, id);
    assertCampusInScope(user.campusScopes.STREAMS, current.campusId);
    await this.prisma.liveStream.delete({ where: { id } });
    // Sigue emitiendo: sin esto, la detección la publicaría de nuevo a los dos minutos.
    if (current.isLive && current.externalId) await this.prisma.church.update({ where: { id: churchId }, data: { ignoredLiveIds: { push: current.externalId } } });
    await this.track(churchId, user.id, ActivityAction.DELETE, ActivityEntity.STREAM, current);
    return { ok: true };
  }

  /** Qué transmisiones deja de lado una que empieza: las de su misma sede, o todas si son compartidas. */
  private liveRival(user: AuthUser, campusId: string | null) {
    return user.campusSeparated.includes(CampusAspect.STREAMS) ? { campusId } : {};
  }

  private campusToSave(churchId: string, user: AuthUser, aspect: ContentAspect, requested: string | null | undefined, current?: { campusId: string | null }) {
    return campusToSave(this.prisma, churchId, user, aspect, requested, current);
  }

  private async ensureStream(churchId: string, id: string) {
    const stream = await this.prisma.liveStream.findFirst({ where: { id, churchId } });
    if (!stream) throw new NotFoundException('Transmisión no encontrada');
    return stream;
  }

  private notifyAnnouncement(churchId: string, user: AuthUser, item: { title: string; campusId: string | null }) {
    return this.notifyChurch(churchId, user, CampusAspect.ANNOUNCEMENTS, item, `Nueva novedad: ${item.title}`, '/app/novedades');
  }

  private notifyLive(churchId: string, user: AuthUser, item: { title: string; campusId: string | null }) {
    return this.notifyChurch(churchId, user, CampusAspect.STREAMS, item, `En vivo ahora: ${item.title}`, '/app/en-vivo');
  }

  /** Lo de una sede se avisa solo en esa sede, mientras el área esté separada. */
  private async notifyChurch(churchId: string, user: AuthUser, aspect: ContentAspect, item: { campusId: string | null }, body: string, url: string) {
    const { name } = await this.prisma.church.findUniqueOrThrow({ where: { id: churchId }, select: { name: true } });
    await this.push.sendToChurch(churchId, { title: name, body, url }, user.id, user.campusSeparated.includes(aspect) ? item.campusId : null);
  }

  private track(churchId: string, userId: string, action: ActivityAction, entity: ActivityEntity, item: { id: string; title: string }, detail?: string | null) {
    return this.activity.log({ churchId, userId, action, entity, entityId: item.id, title: item.title, detail });
  }

  private checkRange(dto: EventDto) {
    if (dto.endsAt && new Date(dto.endsAt) < new Date(dto.startsAt)) {
      throw new BadRequestException('La fecha de fin debe ser posterior al inicio');
    }
  }
}
