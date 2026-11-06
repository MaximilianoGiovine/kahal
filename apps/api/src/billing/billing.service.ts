import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChurchSubscription, PaymentGateway, SubscriptionStatus, UserStatus } from '@prisma/client';
import { escapeHtml, MailService, mailLayout } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutDto } from './billing.dto';
import { GatewayClient, MercadoPagoGateway, PayPalGateway } from './gateways';
import { planForTimezone } from './plans';

const OPEN: SubscriptionStatus[] = [SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED];
/** Un pago sin terminar deja de contar pasado este tiempo. */
const PENDING_DAYS = 7;
const DAY_MS = 86_400_000;
/** Mercado Pago reintenta un cobro rechazado durante 10 días: mientras tanto no se bloquea. */
const RETRY_DAYS = 10;
/** Anticipación del aviso de bloqueo. */
const NOTICE_DAYS = 7;
const ACCESS_CACHE_MS = 30_000;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  /** El guard consulta en cada request: se recuerda un momento y se olvida al cambiar la suscripción. */
  private readonly blockedCache = new Map<string, { blocked: boolean; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mercadoPago: MercadoPagoGateway,
    private readonly payPal: PayPalGateway,
    private readonly mail: MailService,
  ) {}

  private client(gateway: PaymentGateway): GatewayClient {
    return gateway === PaymentGateway.MERCADOPAGO ? this.mercadoPago : this.payPal;
  }

  private publicUrl() {
    return this.config.get<string>('PUBLIC_URL')?.replace(/\/+$/, '') || '';
  }

  private async church(churchId: string) {
    const church = await this.prisma.church.findUnique({
      where: { id: churchId },
      select: { id: true, name: true, timezone: true, deletionScheduledFor: true },
    });
    if (!church) throw new NotFoundException('Iglesia no encontrada');
    return church;
  }

  private available(gateway: PaymentGateway) {
    return this.client(gateway).configured() && !!this.publicUrl();
  }

  /** `until` es la fecha en que se bloqueará si nada cambia; sin fecha, no hay bloqueo a la vista. */
  async access(churchId: string): Promise<{ blocked: boolean; until: Date | null }> {
    const church = await this.prisma.church.findUnique({
      where: { id: churchId },
      select: { billingExempt: true, billingGraceUntil: true, deletionScheduledFor: true, timezone: true },
    });
    if (!church) throw new NotFoundException('Iglesia no encontrada');
    // Con la baja pedida ya no se cobra, y la iglesia tiene que poder exportar antes del borrado.
    if (church.billingExempt || church.deletionScheduledFor) return { blocked: false, until: null };
    const now = Date.now();
    const subscriptions = await this.prisma.churchSubscription.findMany({
      where: { churchId, status: { not: SubscriptionStatus.PENDING } },
      select: { status: true, currentPeriodEnd: true },
    });
    const renewing = subscriptions.some(
      (s) => s.status === SubscriptionStatus.ACTIVE && (!s.currentPeriodEnd || s.currentPeriodEnd.getTime() > now),
    );
    if (renewing) return { blocked: false, until: null };
    const covered = [
      church.billingGraceUntil?.getTime() ?? 0,
      ...subscriptions.map((s) => {
        const end = s.currentPeriodEnd?.getTime() ?? 0;
        return s.status === SubscriptionStatus.ACTIVE ? end + RETRY_DAYS * DAY_MS : end;
      }),
    ];
    const until = Math.max(...covered);
    if (until > now) return { blocked: false, until: new Date(until) };
    // El contrato no exige pagar mientras no haya un medio de pago para esa iglesia.
    if (!this.available(planForTimezone(church.timezone).gateway)) return { blocked: false, until: null };
    return { blocked: true, until: null };
  }

  async isBlocked(churchId: string) {
    const cached = this.blockedCache.get(churchId);
    if (cached && cached.expiresAt > Date.now()) return cached.blocked;
    const { blocked } = await this.access(churchId);
    this.blockedCache.set(churchId, { blocked, expiresAt: Date.now() + ACCESS_CACHE_MS });
    return blocked;
  }

  async overview(churchId: string) {
    const church = await this.church(churchId);
    const plan = planForTimezone(church.timezone);
    const subscriptions = await this.prisma.churchSubscription.findMany({ where: { churchId }, orderBy: { createdAt: 'desc' } });
    // Una suscripción cancelada sin llegar a pagarse no es la que tuvo la iglesia.
    const current =
      subscriptions.find((s) => s.status === SubscriptionStatus.ACTIVE || s.status === SubscriptionStatus.PAUSED) ??
      subscriptions.find((s) => s.status === SubscriptionStatus.CANCELLED && (s.currentPeriodEnd || s.lastPaymentAt)) ??
      null;
    return {
      plan: { gateway: plan.gateway, label: plan.label, currency: plan.currency, minAmount: plan.minAmount, available: this.available(plan.gateway) },
      access: await this.access(churchId),
      current: current && {
        gateway: current.gateway,
        amount: Number(current.amount),
        currency: current.currency,
        status: current.status,
        currentPeriodEnd: current.currentPeriodEnd,
        lastPaymentAt: current.lastPaymentAt,
      },
      pending: subscriptions.some((s) => s.status === SubscriptionStatus.PENDING),
    };
  }

  async checkout(churchId: string, dto: CheckoutDto) {
    const church = await this.church(churchId);
    if (church.deletionScheduledFor) throw new BadRequestException('Cancela la baja de la iglesia antes de suscribirte');
    const plan = planForTimezone(church.timezone);
    const client = this.client(plan.gateway);
    const publicUrl = this.publicUrl();
    if (!client.configured() || !publicUrl) throw new ServiceUnavailableException(`${plan.label} todavía no está disponible`);
    if (dto.amount < plan.minAmount) throw new BadRequestException(`El importe mínimo es de ${plan.minAmount} ${plan.currency}`);
    if (plan.gateway === PaymentGateway.MERCADOPAGO && !dto.payerEmail) throw new BadRequestException('Indica el correo de tu cuenta de Mercado Pago');

    // Cambiar el importe crea otra suscripción: no debe volver a cobrar un período ya pagado.
    const paid = await this.prisma.churchSubscription.findFirst({
      where: { churchId, currentPeriodEnd: { gt: new Date() } },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { currentPeriodEnd: true },
    });
    const { externalId, checkoutUrl } = await client.create({
      churchId,
      churchName: church.name,
      amount: dto.amount,
      currency: plan.currency,
      payerEmail: dto.payerEmail,
      startAt: paid?.currentPeriodEnd ?? undefined,
      returnUrl: `${publicUrl}/app/suscripcion?resultado=ok`,
      cancelUrl: `${publicUrl}/app/suscripcion?resultado=cancelado`,
    });
    await this.prisma.churchSubscription.create({
      data: { churchId, churchName: church.name, gateway: plan.gateway, externalId, amount: dto.amount, currency: plan.currency },
    });
    return { url: checkoutUrl };
  }

  /** La pasarela manda: los avisos solo indican qué suscripción volver a consultar. */
  private async sync(subscription: ChurchSubscription) {
    const state = await this.client(subscription.gateway).fetch(subscription.externalId);
    const active = state.status === SubscriptionStatus.ACTIVE;
    const updated = await this.prisma.churchSubscription.update({
      where: { id: subscription.id },
      data: {
        status: state.status,
        // Al cancelar, la pasarela deja de informar la fecha: lo pagado sigue vigente hasta la última conocida.
        ...(active && state.nextBillingAt ? { currentPeriodEnd: state.nextBillingAt } : {}),
        ...(state.lastPaymentAt ? { lastPaymentAt: state.lastPaymentAt } : {}),
        cancelledAt: state.status === SubscriptionStatus.CANCELLED ? (subscription.cancelledAt ?? new Date()) : null,
      },
    });
    if (active) await this.replaceOlder(updated);
    if (subscription.churchId) this.blockedCache.delete(subscription.churchId);
    return updated;
  }

  /** Una iglesia paga una sola suscripción: la más reciente reemplaza a las anteriores. */
  private async replaceOlder(subscription: ChurchSubscription) {
    if (!subscription.churchId) return;
    const older = await this.prisma.churchSubscription.findMany({
      where: { churchId: subscription.churchId, status: { in: OPEN }, createdAt: { lt: subscription.createdAt } },
    });
    for (const previous of older) {
      await this.cancelOne(previous).catch((e) => this.logger.error(`No se pudo cancelar la suscripción ${previous.id}: ${e instanceof Error ? e.message : e}`));
    }
  }

  private async cancelOne(subscription: ChurchSubscription) {
    const client = this.client(subscription.gateway);
    try {
      await client.cancel(subscription.externalId);
    } catch (e) {
      // PayPal rechaza cancelar lo que aún no se aprobó o lo que ya está cancelado.
      const state = await client.fetch(subscription.externalId);
      if (state.status === SubscriptionStatus.ACTIVE || state.status === SubscriptionStatus.PAUSED) throw e;
    }
    await this.prisma.churchSubscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (subscription.churchId) this.blockedCache.delete(subscription.churchId);
  }

  /** Falla si alguna sigue cobrando: quien llama decide si puede continuar. */
  async cancelForChurch(churchId: string) {
    const open = await this.prisma.churchSubscription.findMany({ where: { churchId, status: { in: OPEN } } });
    for (const subscription of open) await this.cancelOne(subscription);
  }

  async refresh(churchId: string) {
    const open = await this.prisma.churchSubscription.findMany({ where: { churchId, status: { in: OPEN } }, orderBy: { createdAt: 'asc' } });
    for (const subscription of open) await this.sync(subscription);
    return this.overview(churchId);
  }

  // --- Avisos de las pasarelas ---

  private async syncByExternalId(externalId: string) {
    const subscription = await this.prisma.churchSubscription.findUnique({ where: { externalId } });
    if (!subscription) {
      this.logger.warn(`Aviso de una suscripción desconocida: ${externalId}`);
      return;
    }
    await this.sync(subscription);
  }

  async handleMercadoPago(input: { dataId?: string; requestId?: string; signature?: string; type?: string }) {
    const { dataId, requestId, signature, type } = input;
    if (!dataId || !requestId || !signature || !this.mercadoPago.verifySignature(dataId, requestId, signature)) {
      throw new UnauthorizedException('Firma no válida');
    }
    if (type === 'subscription_preapproval') await this.syncByExternalId(dataId);
    if (type === 'subscription_authorized_payment') {
      const externalId = await this.mercadoPago.subscriptionOfPayment(dataId);
      if (externalId) await this.syncByExternalId(externalId);
    }
  }

  async handlePayPal(headers: Record<string, string | string[] | undefined>, rawBody?: Buffer) {
    if (!rawBody || !this.payPal.configured() || !(await this.payPal.verifySignature(headers, rawBody.toString('utf8')))) {
      throw new UnauthorizedException('Firma no válida');
    }
    const event = JSON.parse(rawBody.toString('utf8')) as { event_type?: string; resource?: { id?: string; billing_agreement_id?: string } };
    const externalId = event.event_type?.startsWith('BILLING.SUBSCRIPTION.')
      ? event.resource?.id
      : event.event_type?.startsWith('PAYMENT.SALE.')
        ? event.resource?.billing_agreement_id
        : undefined;
    if (externalId) await this.syncByExternalId(externalId);
  }

  // --- Revisión diaria ---

  /** Recupera los avisos perdidos, reintenta cancelaciones y cierra los pagos que nunca se terminaron. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async reconcile() {
    const cutoff = new Date(Date.now() - PENDING_DAYS * 86_400_000);
    const open = await this.prisma.churchSubscription.findMany({ where: { status: { in: OPEN } }, orderBy: { createdAt: 'asc' } });
    for (const subscription of open) {
      if (!this.client(subscription.gateway).configured()) continue;
      try {
        const updated = await this.sync(subscription);
        if (updated.status === SubscriptionStatus.PENDING && updated.createdAt <= cutoff) await this.cancelOne(updated);
      } catch (e) {
        this.logger.error(`Falló la revisión de la suscripción ${subscription.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
    await this.sendNotices().catch((e) => this.logger.error(`Fallaron los avisos de falta de pago: ${e instanceof Error ? e.message : e}`));
  }

  /** El contrato pide avisar a quien administra antes de bloquear. Cada iglesia recibe un aviso hasta regularizarse. */
  async sendNotices() {
    const churches = await this.prisma.church.findMany({
      where: { billingExempt: false, deletionScheduledFor: null, active: true },
      select: { id: true, name: true, billingNoticeAt: true },
    });
    for (const church of churches) {
      const { blocked, until } = await this.access(church.id);
      const due = blocked || (until && until.getTime() - Date.now() <= NOTICE_DAYS * DAY_MS);
      if (!due) {
        if (church.billingNoticeAt && !until) await this.prisma.church.update({ where: { id: church.id }, data: { billingNoticeAt: null } });
        continue;
      }
      if (church.billingNoticeAt) continue;
      const when = blocked ? 'Su acceso está bloqueado temporalmente' : `Su acceso se bloqueará el ${until!.toISOString().slice(0, 10)}`;
      const admins = await this.prisma.user.findMany({
        where: { churchId: church.id, status: UserStatus.ACTIVE, roles: { some: { role: { isAdmin: true } } } },
        select: { email: true },
      });
      const title = 'Activa la suscripción de tu iglesia';
      const body = `${when} por falta de una suscripción activa en ${escapeHtml(church.name)}. Para evitarlo o restablecerlo, entra a ${escapeHtml(this.publicUrl())}/app/suscripcion. Los datos se conservan y los meses bloqueados no generan deuda.`;
      await Promise.all(admins.map((a) => this.mail.send({ to: a.email, subject: `${title}: ${church.name}`, html: mailLayout(church.name, title, body) })));
      await this.prisma.church.update({ where: { id: church.id }, data: { billingNoticeAt: new Date() } });
    }
  }
}
