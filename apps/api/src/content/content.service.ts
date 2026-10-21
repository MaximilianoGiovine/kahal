import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, StreamPlatform } from '@prisma/client';
import { AuthUser, CONTENT_ROLES } from '../common/auth-user';
import { PageQuery, paginate } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AnnouncementDto, EventDto, EventsQuery, StreamDto } from './content.dto';

const AUTHOR = { select: { id: true, firstName: true, lastName: true } };

export function detectPlatform(url: string): StreamPlatform {
  const host = new URL(url).hostname.replace(/^www\.|^m\./, '');
  if (['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return StreamPlatform.YOUTUBE;
  if (['facebook.com', 'fb.watch', 'fb.com'].includes(host)) return StreamPlatform.FACEBOOK;
  return StreamPlatform.OTHER;
}

const isEditor = (u: AuthUser) => u.role === Role.SUPER_ADMIN || CONTENT_ROLES.includes(u.role);

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

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

  createAnnouncement(churchId: string, userId: string, dto: AnnouncementDto) {
    return this.prisma.announcement.create({ data: { ...dto, churchId, authorId: userId }, include: { author: AUTHOR } });
  }

  async updateAnnouncement(churchId: string, id: string, dto: AnnouncementDto) {
    const current = await this.prisma.announcement.findFirst({ where: { id, churchId } });
    if (!current) throw new NotFoundException('Novedad no encontrada');
    // Al publicar un borrador, la fecha de publicación pasa a ser ahora.
    const publishedAt = dto.published && !current.published ? new Date() : undefined;
    return this.prisma.announcement.update({ where: { id }, data: { ...dto, publishedAt }, include: { author: AUTHOR } });
  }

  async removeAnnouncement(churchId: string, id: string) {
    const { count } = await this.prisma.announcement.deleteMany({ where: { id, churchId } });
    if (!count) throw new NotFoundException('Novedad no encontrada');
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

  createEvent(churchId: string, userId: string, dto: EventDto) {
    this.checkRange(dto);
    return this.prisma.event.create({ data: { ...dto, churchId, createdById: userId } });
  }

  async updateEvent(churchId: string, id: string, dto: EventDto) {
    this.checkRange(dto);
    if (!(await this.prisma.event.findFirst({ where: { id, churchId } }))) throw new NotFoundException('Evento no encontrado');
    return this.prisma.event.update({ where: { id }, data: dto });
  }

  async removeEvent(churchId: string, id: string) {
    const { count } = await this.prisma.event.deleteMany({ where: { id, churchId } });
    if (!count) throw new NotFoundException('Evento no encontrado');
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

  async createStream(churchId: string, dto: StreamDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isLive) await tx.liveStream.updateMany({ where: { churchId, isLive: true }, data: { isLive: false } });
      return tx.liveStream.create({ data: { ...dto, platform: detectPlatform(dto.url), churchId } });
    });
  }

  async updateStream(churchId: string, id: string, dto: StreamDto) {
    await this.ensureStream(churchId, id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isLive) await tx.liveStream.updateMany({ where: { churchId, isLive: true, id: { not: id } }, data: { isLive: false } });
      return tx.liveStream.update({ where: { id }, data: { ...dto, platform: detectPlatform(dto.url) } });
    });
  }

  /** Solo puede haber una transmisión en vivo por iglesia. */
  async setLive(churchId: string, id: string, isLive: boolean) {
    await this.ensureStream(churchId, id);
    return this.prisma.$transaction(async (tx) => {
      if (isLive) await tx.liveStream.updateMany({ where: { churchId, isLive: true }, data: { isLive: false } });
      return tx.liveStream.update({ where: { id }, data: { isLive, ...(isLive && { scheduledAt: new Date() }) } });
    });
  }

  async removeStream(churchId: string, id: string) {
    const { count } = await this.prisma.liveStream.deleteMany({ where: { id, churchId } });
    if (!count) throw new NotFoundException('Transmisión no encontrada');
    return { ok: true };
  }

  private async ensureStream(churchId: string, id: string) {
    if (!(await this.prisma.liveStream.findFirst({ where: { id, churchId } }))) throw new NotFoundException('Transmisión no encontrada');
  }

  private checkRange(dto: EventDto) {
    if (dto.endsAt && new Date(dto.endsAt) < new Date(dto.startsAt)) {
      throw new BadRequestException('La fecha de fin debe ser posterior al inicio');
    }
  }
}
