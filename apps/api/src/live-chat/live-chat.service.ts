import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { Permission, Prisma } from '@prisma/client';
import { AuthUser, can } from '../common/auth-user';
import { assertCampusInScope, audienceWhere } from '../common/campus-scope';
import { LOCALE } from '../common/locale';
import { paginate } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { ChatLogsQuery } from './live-chat.dto';
import { LiveChatHub } from './live-chat.hub';

/** Mensajes que se cargan al abrir el chat. Lo anterior queda en el registro. */
const HISTORY = 200;
/** Hasta 5 mensajes cada 10 segundos por persona. */
const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 10;

const MESSAGE_SELECT = { id: true, userId: true, authorName: true, body: true, createdAt: true } satisfies Prisma.LiveChatMessageSelect;

/**
 * Chat de las transmisiones en vivo. Solo admite mensajes mientras la transmisión está en vivo;
 * cuando termina, la conversación pasa al Registro (`LiveChatLog`) y el chat se cierra.
 */
@Injectable()
export class LiveChatService {
  private readonly logger = new Logger(LiveChatService.name);
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: LiveChatHub,
  ) {}

  /** Estado del chat y últimos mensajes, para abrirlo. */
  async open(churchId: string, user: AuthUser, streamId: string) {
    const stream = await this.visibleStream(churchId, user, streamId);
    const church = await this.prisma.church.findUniqueOrThrow({ where: { id: churchId }, select: { liveChatEnabled: true, liveChatWelcome: true } });
    const open = stream.isLive && church.liveChatEnabled;
    const messages = open
      ? (
          await this.prisma.liveChatMessage.findMany({
            where: { streamId, deletedAt: null },
            select: MESSAGE_SELECT,
            orderBy: { createdAt: 'desc' },
            take: HISTORY,
          })
        ).reverse()
      : [];
    return {
      open,
      welcome: open ? church.liveChatWelcome?.trim() || null : null,
      canModerate: this.canModerate(user, stream.campusId),
      messages,
    };
  }

  /** Eventos en tiempo real del chat. Falla igual que `open` si la persona no ve la transmisión. */
  async join(churchId: string, user: AuthUser, streamId: string) {
    await this.visibleStream(churchId, user, streamId);
    return this.hub.join(streamId);
  }

  async send(churchId: string, user: AuthUser, streamId: string, text: string) {
    const body = text.trim();
    if (!body) throw new BadRequestException('Escribe un mensaje');
    const stream = await this.visibleStream(churchId, user, streamId);
    const church = await this.prisma.church.findUniqueOrThrow({ where: { id: churchId }, select: { liveChatEnabled: true } });
    if (!stream.isLive || !church.liveChatEnabled) throw new BadRequestException('El chat está cerrado: la transmisión ya no está en vivo');
    if (!(await this.hub.allow(user.id, RATE_LIMIT, RATE_WINDOW_SECONDS))) {
      throw new HttpException('Estás enviando mensajes muy seguido. Espera unos segundos.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const author = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { firstName: true, lastName: true } });
    const [message] = await this.prisma.$transaction([
      this.prisma.liveChatMessage.create({
        data: { churchId, streamId, userId: user.id, authorName: `${author.firstName} ${author.lastName}`.trim(), body },
        select: MESSAGE_SELECT,
      }),
      // Si la transmisión volvió a estar en vivo después de cerrar su chat, se reabre: al terminar se actualiza el registro.
      this.prisma.liveStream.updateMany({ where: { id: streamId, chatClosedAt: { not: null } }, data: { chatClosedAt: null } }),
    ]);
    await this.hub.publish(streamId, { type: 'message', message });
    return message;
  }

  /** Lo quita su autor o quien gestiona las transmisiones. Queda marcado en el registro. */
  async remove(churchId: string, user: AuthUser, messageId: string) {
    const message = await this.prisma.liveChatMessage.findFirst({
      where: { id: messageId, churchId, deletedAt: null },
      select: { id: true, userId: true, streamId: true, stream: { select: { campusId: true } } },
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    if (message.userId !== user.id && !this.canModerate(user, message.stream.campusId)) throw new ForbiddenException('Solo puedes quitar tus propios mensajes');
    await this.prisma.liveChatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date(), deletedById: user.id } });
    await this.hub.publish(message.streamId, { type: 'deleted', id: messageId });
    return { ok: true };
  }

  // Cierre

  /**
   * Cierra los chats de las transmisiones que ya no están en vivo y guarda su registro.
   * Corre cada minuto, y además justo después de cada cambio de transmisión para cerrar al instante.
   */
  @Cron('* * * * *')
  async closeEnded(churchId?: string) {
    if (this.sweeping && !churchId) return;
    if (!churchId) this.sweeping = true;
    try {
      const ended = await this.prisma.liveStream.findMany({
        where: { ...(churchId && { churchId }), isLive: false, chatClosedAt: null, chatMessages: { some: {} } },
        select: { id: true },
      });
      for (const { id } of ended) await this.close(id).catch((e) => this.logger.error(`No se pudo cerrar el chat ${id}: ${e instanceof Error ? e.message : e}`));
    } finally {
      if (!churchId) this.sweeping = false;
    }
  }

  /** Antes de borrar una transmisión: sus mensajes se borran con ella, el registro queda. */
  async closeBeforeDelete(streamId: string) {
    await this.close(streamId, true);
  }

  private async close(streamId: string, force = false) {
    const now = new Date();
    const claimed = await this.prisma.liveStream.updateMany({
      where: { id: streamId, chatClosedAt: null, ...(!force && { isLive: false }) },
      data: { chatClosedAt: now },
    });
    if (!claimed.count) return;

    const stream = await this.prisma.liveStream.findUniqueOrThrow({
      where: { id: streamId },
      select: { churchId: true, title: true, church: { select: { name: true, timezone: true, liveChatWelcome: true } } },
    });
    const messages = await this.prisma.liveChatMessage.findMany({
      where: { streamId },
      select: { authorName: true, userId: true, body: true, createdAt: true, deletedAt: true },
      orderBy: { createdAt: 'asc' },
    });
    if (messages.length) {
      const data = {
        title: stream.title,
        startedAt: messages[0].createdAt,
        endedAt: now,
        messageCount: messages.filter((m) => !m.deletedAt).length,
        participantCount: new Set(messages.map((m) => m.userId ?? m.authorName)).size,
        transcript: this.transcript(stream, messages, now),
      };
      await this.prisma.liveChatLog.upsert({ where: { streamId }, create: { ...data, churchId: stream.churchId, streamId }, update: data });
    }
    await this.hub.publish(streamId, { type: 'closed' });
  }

  private transcript(
    stream: { title: string; church: { name: string; timezone: string; liveChatWelcome: string | null } },
    messages: { authorName: string; body: string; createdAt: Date; deletedAt: Date | null }[],
    endedAt: Date,
  ) {
    const { timezone } = stream.church;
    const day = new Intl.DateTimeFormat(LOCALE, { timeZone: timezone, dateStyle: 'long' });
    const time = new Intl.DateTimeFormat(LOCALE, { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const lines = [
      `Chat en vivo: ${stream.title}`,
      `${stream.church.name} · ${day.format(messages[0].createdAt)}, de ${time.format(messages[0].createdAt)} a ${time.format(endedAt)}`,
      '',
    ];
    if (stream.church.liveChatWelcome?.trim()) lines.push(`[Bienvenida] ${stream.church.liveChatWelcome.trim()}`, '');
    for (const m of messages) {
      lines.push(`[${time.format(m.createdAt)}] ${m.authorName}: ${m.body.replace(/\n/g, '\n    ')}${m.deletedAt ? '  (quitado)' : ''}`);
    }
    return lines.join('\n');
  }

  /** Avisa a los chats abiertos cuya transmisión terminó, tenga o no mensajes. Una sola consulta por proceso. */
  @Interval(15_000)
  async closeStaleRooms() {
    const open = this.hub.openRooms();
    if (!open.length) return;
    const live = await this.prisma.liveStream.findMany({
      where: { id: { in: open }, isLive: true, church: { liveChatEnabled: true } },
      select: { id: true },
    });
    const stillOpen = new Set(live.map((s) => s.id));
    for (const id of open) if (!stillOpen.has(id)) this.hub.emitLocal(id, { type: 'closed' });
  }

  // Registro

  async logs(churchId: string, q: ChatLogsQuery) {
    const where: Prisma.LiveChatLogWhereInput = { churchId, ...(q.q && { title: { contains: q.q, mode: 'insensitive' } }) };
    const [items, total] = await Promise.all([
      this.prisma.liveChatLog.findMany({
        where,
        select: { id: true, title: true, startedAt: true, endedAt: true, messageCount: true, participantCount: true },
        orderBy: { endedAt: 'desc' },
        ...paginate(q),
      }),
      this.prisma.liveChatLog.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async log(churchId: string, id: string) {
    const log = await this.prisma.liveChatLog.findFirst({ where: { id, churchId } });
    if (!log) throw new NotFoundException('Registro no encontrado');
    return log;
  }

  // Apoyo

  private canModerate(user: AuthUser, campusId: string | null) {
    if (!can(user, Permission.CONTENT_MANAGE)) return false;
    try {
      assertCampusInScope(user.campusScopes.STREAMS, campusId);
      return true;
    } catch {
      return false;
    }
  }

  private async visibleStream(churchId: string, user: AuthUser, streamId: string) {
    const stream = await this.prisma.liveStream.findFirst({
      where: { id: streamId, churchId, ...audienceWhere(user.audiences.STREAMS) },
      select: { id: true, isLive: true, campusId: true },
    });
    if (!stream) throw new NotFoundException('Transmisión no encontrada');
    return stream;
  }
}
