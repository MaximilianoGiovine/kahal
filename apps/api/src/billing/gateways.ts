import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

export interface CreateInput {
  churchId: string;
  churchName: string;
  amount: number;
  currency: string;
  payerEmail?: string;
  /** Si ya hay un período pagado, el primer cobro espera a que termine. */
  startAt?: Date;
  returnUrl: string;
  cancelUrl: string;
}

export interface GatewayState {
  status: SubscriptionStatus;
  nextBillingAt?: Date;
  lastPaymentAt?: Date;
}

export interface GatewayClient {
  configured(): boolean;
  create(input: CreateInput): Promise<{ externalId: string; checkoutUrl: string }>;
  fetch(externalId: string): Promise<GatewayState>;
  cancel(externalId: string): Promise<void>;
}

const TIMEOUT_MS = 15_000;

/** Conserva la respuesta de la pasarela para reconocer los rechazos que quien paga puede resolver. */
class GatewayRejected extends BadGatewayException {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
  }
}

const date = (value: unknown) => {
  const parsed = typeof value === 'string' ? new Date(value) : undefined;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
};

/** Llama a la pasarela. El detalle de un error va al log: al usuario le llega un mensaje general. */
async function call(logger: Logger, name: string, url: string, init: RequestInit) {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    logger.error(`${name} no respondió: ${e instanceof Error ? e.message : e}`);
    throw new BadGatewayException(`${name} no está respondiendo. Intenta de nuevo en unos minutos.`);
  }
  const text = await res.text();
  if (!res.ok) {
    logger.error(`${name} respondió ${res.status} a ${init.method ?? 'GET'} ${new URL(url).pathname}: ${text.slice(0, 500)}`);
    throw new GatewayRejected(`${name} rechazó la operación. Revisa los datos e intenta de nuevo.`, text);
  }
  return (text ? JSON.parse(text) : {}) as Record<string, any>;
}

/**
 * Suscripciones sin plan asociado: un plan de Mercado Pago tiene importe fijo y aquí lo elige cada iglesia.
 * El correo debe ser el de la cuenta de Mercado Pago que paga, o la pasarela rechaza el cobro.
 */
@Injectable()
export class MercadoPagoGateway implements GatewayClient {
  private readonly logger = new Logger(MercadoPagoGateway.name);

  constructor(private readonly config: ConfigService) {}

  configured() {
    return !!this.config.get('MERCADOPAGO_ACCESS_TOKEN') && !!this.config.get('MERCADOPAGO_WEBHOOK_SECRET');
  }

  private request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const base = this.config.get('MERCADOPAGO_API_URL') || 'https://api.mercadopago.com';
    return call(this.logger, 'Mercado Pago', `${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.config.get('MERCADOPAGO_ACCESS_TOKEN')}`, 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async create(input: CreateInput) {
    const created = await this.request(
      '/preapproval',
      'POST',
      {
        reason: `Suscripción a Kahal: ${input.churchName}`.slice(0, 255),
        external_reference: input.churchId,
        payer_email: input.payerEmail,
        back_url: input.returnUrl,
        status: 'pending',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: input.amount,
          currency_id: input.currency,
          ...(input.startAt ? { start_date: input.startAt.toISOString() } : {}),
        },
      },
      { 'X-Idempotency-Key': randomUUID() },
    ).catch((e) => {
      throw this.payerEmailError(e);
    });
    if (!created.id || !created.init_point) throw new BadGatewayException('Mercado Pago no devolvió el enlace de pago');
    return { externalId: String(created.id), checkoutUrl: String(created.init_point) };
  }

  /** Mercado Pago no distingue con claridad estos rechazos: se traducen a algo que quien paga pueda corregir. */
  private payerEmailError(e: unknown) {
    const detail = e instanceof GatewayRejected ? e.detail : '';
    if (/cannot be the same user/i.test(detail)) {
      return new BadRequestException('Ese correo es el de la cuenta que recibe los pagos de Kahal. Usa el de otra cuenta de Mercado Pago.');
    }
    if (/must be real or test users|user bad request/i.test(detail)) {
      return new BadRequestException('No encontramos una cuenta de Mercado Pago con ese correo. Escribe el correo con el que ingresas a Mercado Pago, o crea una cuenta con él.');
    }
    return e;
  }

  async fetch(externalId: string): Promise<GatewayState> {
    const sub = await this.request(`/preapproval/${encodeURIComponent(externalId)}`);
    const status =
      sub.status === 'authorized'
        ? SubscriptionStatus.ACTIVE
        : sub.status === 'paused'
          ? SubscriptionStatus.PAUSED
          : sub.status === 'pending'
            ? SubscriptionStatus.PENDING
            : SubscriptionStatus.CANCELLED;
    return { status, nextBillingAt: date(sub.next_payment_date), lastPaymentAt: date(sub.summarized?.last_charged_date) };
  }

  async cancel(externalId: string) {
    await this.request(`/preapproval/${encodeURIComponent(externalId)}`, 'PUT', { status: 'cancelled' });
  }

  /** Los avisos de un cobro traen el id del cobro, no el de la suscripción. */
  async subscriptionOfPayment(paymentId: string) {
    const payment = await this.request(`/authorized_payments/${encodeURIComponent(paymentId)}`);
    return payment.preapproval_id ? String(payment.preapproval_id) : null;
  }

  /** Firma: HMAC-SHA256 de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con la clave del webhook. */
  verifySignature(dataId: string, requestId: string, signature: string) {
    const secret = this.config.get<string>('MERCADOPAGO_WEBHOOK_SECRET');
    const parts = Object.fromEntries(signature.split(',').map((p) => p.trim().split('=', 2) as [string, string]));
    if (!secret || !parts.ts || !parts.v1) return false;
    const expected = createHmac('sha256', secret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`).digest();
    const received = Buffer.from(parts.v1, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  }
}

/** El plan de PayPal fija el producto y la frecuencia; el importe se reemplaza en cada suscripción. */
@Injectable()
export class PayPalGateway implements GatewayClient {
  private readonly logger = new Logger(PayPalGateway.name);
  private token?: { value: string; expiresAt: number };

  constructor(private readonly config: ConfigService) {}

  configured() {
    return ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_PLAN_ID', 'PAYPAL_WEBHOOK_ID'].every((key) => !!this.config.get(key));
  }

  private get base() {
    return this.config.get('PAYPAL_API_URL') || 'https://api-m.paypal.com';
  }

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const credentials = Buffer.from(`${this.config.get('PAYPAL_CLIENT_ID')}:${this.config.get('PAYPAL_CLIENT_SECRET')}`).toString('base64');
    const res = await call(this.logger, 'PayPal', `${this.base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    this.token = { value: String(res.access_token), expiresAt: Date.now() + (Number(res.expires_in) - 60) * 1000 };
    return this.token.value;
  }

  private async request(path: string, method = 'GET', body?: string, headers: Record<string, string> = {}) {
    return call(this.logger, 'PayPal', `${this.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json', ...headers },
      body,
    });
  }

  async create(input: CreateInput) {
    const created = await this.request(
      '/v1/billing/subscriptions',
      'POST',
      JSON.stringify({
        plan_id: this.config.get('PAYPAL_PLAN_ID'),
        custom_id: input.churchId,
        ...(input.startAt ? { start_time: input.startAt.toISOString() } : {}),
        plan: {
          billing_cycles: [{ sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: input.amount.toFixed(2), currency_code: input.currency } } }],
        },
        application_context: {
          brand_name: 'Kahal',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW',
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      }),
      { Prefer: 'return=representation', 'PayPal-Request-Id': randomUUID() },
    );
    const approve = (created.links as { rel: string; href: string }[] | undefined)?.find((l) => l.rel === 'approve')?.href;
    if (!created.id || !approve) throw new BadGatewayException('PayPal no devolvió el enlace de pago');
    return { externalId: String(created.id), checkoutUrl: approve };
  }

  async fetch(externalId: string): Promise<GatewayState> {
    const sub = await this.request(`/v1/billing/subscriptions/${encodeURIComponent(externalId)}`);
    const status =
      sub.status === 'ACTIVE'
        ? SubscriptionStatus.ACTIVE
        : sub.status === 'SUSPENDED'
          ? SubscriptionStatus.PAUSED
          : sub.status === 'APPROVAL_PENDING' || sub.status === 'APPROVED'
            ? SubscriptionStatus.PENDING
            : SubscriptionStatus.CANCELLED;
    return { status, nextBillingAt: date(sub.billing_info?.next_billing_time), lastPaymentAt: date(sub.billing_info?.last_payment?.time) };
  }

  async cancel(externalId: string) {
    await this.request(`/v1/billing/subscriptions/${encodeURIComponent(externalId)}/cancel`, 'POST', JSON.stringify({ reason: 'Cancelada desde Kahal' }));
  }

  /** PayPal comprueba la firma con el cuerpo exacto: por eso se reenvía sin volver a serializarlo. */
  async verifySignature(headers: Record<string, string | string[] | undefined>, rawBody: string) {
    const header = (name: string) => JSON.stringify(String(headers[name] ?? ''));
    const body = `{"auth_algo":${header('paypal-auth-algo')},"cert_url":${header('paypal-cert-url')},"transmission_id":${header('paypal-transmission-id')},"transmission_sig":${header('paypal-transmission-sig')},"transmission_time":${header('paypal-transmission-time')},"webhook_id":${JSON.stringify(this.config.get('PAYPAL_WEBHOOK_ID'))},"webhook_event":${rawBody}}`;
    const res = await this.request('/v1/notifications/verify-webhook-signature', 'POST', body);
    return res.verification_status === 'SUCCESS';
  }
}
