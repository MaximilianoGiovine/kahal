import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Subject } from 'rxjs';

export interface ChatMessageView {
  id: string;
  userId: string | null;
  authorName: string;
  body: string;
  createdAt: Date | string;
}

export type ChatEvent = { type: 'message'; message: ChatMessageView } | { type: 'deleted'; id: string } | { type: 'closed' };

const CHANNEL = 'kahal:live-chat:';

/**
 * Reparte los eventos del chat entre las conexiones abiertas. Pasa por Redis para que funcione igual con varias instancias de la API.
 * Cada proceso se suscribe a un canal solo mientras alguien tiene ese chat abierto.
 */
@Injectable()
export class LiveChatHub implements OnModuleDestroy {
  private readonly logger = new Logger(LiveChatHub.name);
  private readonly pub: Redis;
  private readonly sub: Redis;
  private readonly rooms = new Map<string, Set<Subject<ChatEvent>>>();

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.pub = new Redis(url, { maxRetriesPerRequest: 2 });
    this.sub = new Redis(url);
    for (const client of [this.pub, this.sub]) client.on('error', (e) => this.logger.warn(`Redis del chat: ${e.message}`));
    this.sub.on('message', (channel: string, raw: string) => {
      let event: ChatEvent;
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }
      this.emitLocal(channel.slice(CHANNEL.length), event);
    });
  }

  /** Para la conexión SSE: devuelve el canal y la función que lo libera al cerrarse. */
  join(streamId: string) {
    const subject = new Subject<ChatEvent>();
    let room = this.rooms.get(streamId);
    if (!room) {
      room = new Set();
      this.rooms.set(streamId, room);
      void this.sub.subscribe(CHANNEL + streamId).catch((e) => this.logger.warn(`No se pudo escuchar el chat ${streamId}: ${e.message}`));
    }
    room.add(subject);
    const leave = () => {
      subject.complete();
      const current = this.rooms.get(streamId);
      if (!current) return;
      current.delete(subject);
      if (current.size === 0) {
        this.rooms.delete(streamId);
        void this.sub.unsubscribe(CHANNEL + streamId).catch(() => {});
      }
    };
    return { events: subject.asObservable(), leave };
  }

  /** Chats con alguien conectado a este proceso. */
  openRooms() {
    return [...this.rooms.keys()];
  }

  emitLocal(streamId: string, event: ChatEvent) {
    for (const subject of this.rooms.get(streamId) ?? []) subject.next(event);
  }

  async publish(streamId: string, event: ChatEvent) {
    try {
      await this.pub.publish(CHANNEL + streamId, JSON.stringify(event));
    } catch (e) {
      this.logger.warn(`No se pudo repartir un evento del chat: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Límite de mensajes por persona. Cuenta en Redis: en una iglesia muchos comparten la IP del wifi. */
  async allow(userId: string, limit: number, windowSeconds: number) {
    try {
      const key = `kahal:live-chat:rate:${userId}`;
      const [[, count]] = (await this.pub.multi().incr(key).expire(key, windowSeconds, 'NX').exec()) as [[Error | null, number]];
      return count <= limit;
    } catch {
      return true;
    }
  }

  async onModuleDestroy() {
    for (const room of this.rooms.values()) for (const subject of room) subject.complete();
    this.rooms.clear();
    await Promise.allSettled([this.pub.quit(), this.sub.quit()]);
  }
}
