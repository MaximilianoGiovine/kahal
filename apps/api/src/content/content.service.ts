import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityAction, ActivityEntity, Permission, StreamPlatform } from '@prisma/client';
import { ActivityService, changedFields } from '../activity/activity.service';
import { AuthUser, can } from '../common/auth-user';
import { PageQuery, paginate } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { AnnouncementDto, EventDto, EventsQuery, StreamDto } from './content.dto';

const AUTHOR = { select: { id: true, firstName: true, lastName: true } };

export function detectPlatform(url: string): StreamPlatform {
  const host = new URL(url).hostname.replace(/^www\.|^m\./, '');
  if (['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return StreamPlatform.YOUTUBE;
  if (['facebook.com', 'web.facebook.com', 'fb.watch', 'fb.com'].includes(host)) return StreamPlatform.FACEBOOK;
  if (['twitch.tv', 'player.twitch.tv', 'clips.twitch.tv'].includes(host)) return StreamPlatform.TWITCH;
  return StreamPlatform.OTHER;
}

const isEditor = (u: AuthUser) => can(u, Permission.CONTENT_MANAGE);

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly push: PushService,
  ) {}

  // Novedades

  async announcements(churchId: string, user: AuthUser, q: PageQuery) {
    const where = { churchId, ...(!isEditor(user) && { published: true, publishedAt: { lte: new Date() } }) };
    const [items, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        include: { author: AUTHOR },
        orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
        ...paginate(q),
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async createAnnouncement(churchId: string, userId: string, dto: AnnouncementDto) {
    const item = await this.prisma.announcement.create({ data: { ...dto, churchId, authorId: userId }, include: { author: AUTHOR } });
    await this.track(churchId, userId, ActivityAction.CREATE, ActivityEntity.ANNOUNCEMENT, item);
    if (item.published) await this.notifyAnnouncement(churchId, userId, item);
    return item;
  }

  async updateAnnouncement(churchId: string, userId: string, id: string, dto: AnnouncementDto) {
    const current = await this.prisma.announcement.findFirst({ where: { id, churchId } });
    if (!current) throw new NotFoundException('Novedad no encontrada');
    // Al publicar un borrador, la fecha de publicación pasa a ser ahora.
    const publishedAt = dto.published && !current.published ? new Date() : undefined;
    const item = await this.prisma.announcement.update({ where: { id }, data: { ...dto, publishedAt }, include: { author: AUTHOR } });
    await this.track(churchId, userId, ActivityAction.UPDATE, ActivityEntity.ANNOUNCEMENT, item, changedFields(current, dto));
    if (item.published && !current.published) await this.notifyAnnouncement(churchId, userId, item);
    return item;
  }

  async removeAnnouncement(churchId: string, userId: string, id: string) {
    const current = await this.prisma.announcement.findFirst({ where: { id, churchId } });
    if (!current) throw new NotFoundException('Novedad no encontrada');
    await this.prisma.announcement.delete({ where: { id } });
    await this.track(churchId, userId, ActivityAction.DELETE, ActivityEntity.ANNOUNCEMENT, current);
    return { ok: true };
  }

  // Eventos

  events(churchId: string, q: EventsQuery) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 24 * 3600 * 1000);
    return this.prisma.event.findMany({
      where: { churchId, startsAt: { gte: from, lte: q.to ? new Date(q.to) : undefined } },
      orderBy: { startsAt: 'asc' },
      take: 200,
    });
  }

  async createEvent(churchId: string, userId: string, dto: EventDto) {
    this.checkRange(dto);
    const item = await this.prisma.event.create({ data: { ...dto, churchId, createdById: userId } });
    await this.track(churchId, userId, ActivityAction.CREATE, ActivityEntity.EVENT, item);
    if (item.startsAt > new Date()) await this.notifyChurch(churchId, userId, `Nuevo evento: ${item.title}`, '/app/eventos');
    return item;
  }

  async updateEvent(churchId: string, userId: string, id: string, dto: EventDto) {
    this.checkRange(dto);
    const current = await this.prisma.event.findFirst({ where: { id, churchId } });
    if (!current) throw new NotFoundException('Evento no encontrado');
    const item = await this.prisma.event.update({ where: { id }, data: dto });
    await this.track(churchId, userId, ActivityAction.UPDATE, ActivityEntity.EVENT, item, changedFields(current, dto));
    return item;
  }

  async removeEvent(churchId: string, userId: string, id: string) {
    const current = await this.prisma.event.findFirst({ where: { id, churchId } });
    if (!current) throw new NotFoundException('Evento no encontrado');
    await this.prisma.event.delete({ where: { id } });
    await this.track(churchId, userId, ActivityAction.DELETE, ActivityEntity.EVENT, current);
    return { ok: true };
  }

  // Transmisiones

  async streams(churchId: string) {
    const [live, upcoming, past] = await Promise.all([
      this.prisma.liveStream.findFirst({ where: { churchId, isLive: true }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.liveStream.findMany({
        where: { churchId, isLive: false, scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: 'asc' },
        take: 10,
      }),
      this.prisma.liveStream.findMany({
        where: { churchId, isLive: false, OR: [{ scheduledAt: { lt: new Date() } }, { scheduledAt: null }] },
        orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
        take: 30,
      }),
    ]);
    return { live, upcoming, past };
  }

  async createStream(churchId: string, userId: string, dto: StreamDto) {
    const item = await this.prisma.$transaction(async (tx) => {
      if (dto.isLive) await tx.liveStream.updateMany({ where: { churchId, isLive: true }, data: { isLive: false } });
      return tx.liveStream.create({ data: { ...dto, platform: detectPlatform(dto.url), churchId } });
    });
    await this.track(churchId, userId, ActivityAction.CREATE, ActivityEntity.STREAM, item);
    if (item.isLive) await this.notifyLive(churchId, userId, item);
    return item;
  }

  async updateStream(churchId: string, userId: string, id: string, dto: StreamDto) {
    const current = await this.ensureStream(churchId, id);
    const item = await this.prisma.$transaction(async (tx) => {
      if (dto.isLive) await tx.liveStream.updateMany({ where: { churchId, isLive: true, id: { not: id } }, data: { isLive: false } });
      return tx.liveStream.update({ where: { id }, data: { ...dto, platform: detectPlatform(dto.url) } });
    });
    await this.track(churchId, userId, ActivityAction.UPDATE, ActivityEntity.STREAM, item, changedFields(current, dto));
    if (item.isLive && !current.isLive) await this.notifyLive(churchId, userId, item);
    return item;
  }

  /** Solo puede haber una transmisión en vivo por iglesia. */
  async setLive(churchId: string, userId: string, id: string, isLive: boolean) {
    const current = await this.ensureStream(churchId, id);
    const item = await this.prisma.$transaction(async (tx) => {
      if (isLive) await tx.liveStream.updateMany({ where: { churchId, isLive: true }, data: { isLive: false } });
      return tx.liveStream.update({ where: { id }, data: { isLive, ...(isLive && { scheduledAt: new Date() }) } });
    });
    await this.track(churchId, userId, ActivityAction.UPDATE, ActivityEntity.STREAM, item, changedFields(current, { isLive }));
    if (item.isLive && !current.isLive) await this.notifyLive(churchId, userId, item);
    return item;
  }

  async removeStream(churchId: string, userId: string, id: string) {
    const current = await this.ensureStream(churchId, id);
    await this.prisma.liveStream.delete({ where: { id } });
    await this.track(churchId, userId, ActivityAction.DELETE, ActivityEntity.STREAM, current);
    return { ok: true };
  }

  private async ensureStream(churchId: string, id: string) {
    const stream = await this.prisma.liveStream.findFirst({ where: { id, churchId } });
    if (!stream) throw new NotFoundException('Transmisión no encontrada');
    return stream;
  }

  private notifyAnnouncement(churchId: string, userId: string, item: { title: string }) {
    return this.notifyChurch(churchId, userId, `Nueva novedad: ${item.title}`, '/app/novedades');
  }

  private notifyLive(churchId: string, userId: string, item: { title: string }) {
    return this.notifyChurch(churchId, userId, `En vivo ahora: ${item.title}`, '/app/en-vivo');
  }

  private async notifyChurch(churchId: string, userId: string, body: string, url: string) {
    const { name } = await this.prisma.church.findUniqueOrThrow({ where: { id: churchId }, select: { name: true } });
    await this.push.sendToChurch(churchId, { title: name, body, url }, userId);
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
