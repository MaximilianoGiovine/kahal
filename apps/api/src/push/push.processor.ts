import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { PUSH_QUEUE, PushJob } from './push.service';

/** Un día: si el teléfono sigue apagado después de eso, el aviso ya no sirve. */
const TTL_SECONDS = 24 * 60 * 60;

@Processor(PUSH_QUEUE, { concurrency: 10 })
export class PushProcessor extends WorkerHost {
  private readonly logger = new Logger(PushProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<PushJob>) {
    const subscription = await this.prisma.pushSubscription.findUnique({ where: { id: job.data.subscriptionId } });
    if (!subscription) return;
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(job.data.payload),
        { TTL: TTL_SECONDS, urgency: 'high' },
      );
    } catch (err) {
      const status = err instanceof webpush.WebPushError ? err.statusCode : undefined;
      // 404/410: el dispositivo dio de baja el permiso o desinstaló la app. No se vuelve a intentar.
      if (status === 404 || status === 410) {
        await this.prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
        return;
      }
      this.logger.warn(`Falló una notificación (${status ?? 'sin respuesta'}): ${err}`);
      throw err;
    }
  }
}
