import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export const PUSH_QUEUE = 'push';

export interface PushPayload {
  title: string;
  body: string;
  /** Ruta interna de la app que se abre al tocar la notificación. */
  url: string;
  /** Una notificación nueva con el mismo tag reemplaza a la anterior. */
  tag?: string;
}

export interface PushJob {
  subscriptionId: string;
  payload: PushPayload;
}

export interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Los servicios de push cortan los mensajes grandes y solo se ven unas pocas líneas. */
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  readonly publicKey: string | null = null;

  constructor(
    @InjectQueue(PUSH_QUEUE) private readonly queue: Queue<PushJob>,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) return;
    try {
      webpush.setVapidDetails(config.get<string>('VAPID_SUBJECT') || `mailto:${config.get<string>('SUPERADMIN_EMAIL')}`, publicKey, privateKey);
      this.publicKey = publicKey;
    } catch (err) {
      // Una clave mal copiada desactiva las notificaciones, pero no tira abajo la API.
      this.logger.error(`Notificaciones desactivadas, revisa las variables VAPID: ${err}`);
    }
  }

  /** El dispositivo pasa a ser de quien tiene la sesión, aunque antes lo usara otra persona. */
  subscribe(userId: string, { endpoint, p256dh, auth }: SubscriptionInput) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth },
      update: { userId, p256dh, auth },
      select: { id: true },
    });
  }

  unsubscribe(userId: string, endpoint: string) {
    return this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** A toda la congregación activa, salvo a quien generó el aviso. */
  /** Con `campusId`, solo a los miembros de esa sede y a quienes están limitados a ella. */
  async sendToChurch(churchId: string, payload: PushPayload, exceptUserId?: string, campusId?: string | null) {
    await this.enqueue(
      {
        user: {
          churchId,
          status: UserStatus.ACTIVE,
          id: { not: exceptUserId },
          church: { active: true },
          ...(campusId && { OR: [{ member: { campusId } }, { campusRestricted: true, campuses: { some: { campusId } } }] }),
        },
      },
      payload,
    );
  }

  async sendToUsers(userIds: string[], payload: PushPayload) {
    await this.enqueue(
      { user: { id: { in: userIds }, status: UserStatus.ACTIVE, OR: [{ churchId: null }, { church: { active: true } }] } },
      payload,
    );
  }

  async sendToSuperAdmins(payload: PushPayload) {
    await this.enqueue({ user: { isSuperAdmin: true, status: UserStatus.ACTIVE } }, payload);
  }

  /** Igual que el email: un problema con las notificaciones nunca hace fallar la operación que las dispara. */
  private async enqueue(where: Prisma.PushSubscriptionWhereInput, payload: PushPayload) {
    if (!this.publicKey) return;
    try {
      const subscriptions = await this.prisma.pushSubscription.findMany({ where, select: { id: true } });
      const clipped = { ...payload, title: clip(payload.title, 80), body: clip(payload.body, 180) };
      // Un trabajo por dispositivo: reintentar uno no le repite la notificación a los demás.
      await this.queue.addBulk(
        subscriptions.map((s) => ({
          name: 'send',
          data: { subscriptionId: s.id, payload: clipped },
          opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 5000 },
        })),
      );
    } catch (err) {
      this.logger.error(`No se pudieron encolar las notificaciones: ${err}`);
    }
  }
}
