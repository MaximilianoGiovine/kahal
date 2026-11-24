import type { SubscriptionStatus } from '@/lib/billing';
import type { Currency } from '@/lib/types';

export type Gateway = 'MERCADOPAGO' | 'PAYPAL';
export type AdminBillingState = 'BLOCKED' | 'LAPSED' | 'PAUSED' | 'GRACE' | 'NO_GATEWAY' | 'ACTIVE' | 'EXEMPT' | 'CLOSING';

export interface AdminBillingChurch {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  active: boolean;
  createdAt: string;
  timezone: string;
  gateway: Gateway;
  gatewayAvailable: boolean;
  billingExempt: boolean;
  billingExemptNote: string | null;
  billingGraceUntil: string | null;
  deletionScheduledFor: string | null;
  state: AdminBillingState;
  access: { blocked: boolean; until: string | null };
  pending: boolean;
  current: { gateway: Gateway; amount: number; currency: Currency; status: SubscriptionStatus; currentPeriodEnd: string | null; lastPaymentAt: string | null } | null;
}

export interface AdminBilling {
  churches: AdminBillingChurch[];
  monthly: Partial<Record<Currency, number>>;
}

export interface AdminSubscription {
  id: string;
  gateway: Gateway;
  externalId: string;
  amount: number;
  currency: Currency;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  lastPaymentAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export const STATE: Record<AdminBillingState, { label: string; tone: Tone; help: string }> = {
  ACTIVE: { label: 'Pagando', tone: 'success', help: 'Tiene una suscripción activa y al día.' },
  LAPSED: { label: 'Cobro fallido', tone: 'warning', help: 'La pasarela no pudo cobrar y está reintentando. Si no lo logra, se bloquea en la fecha indicada.' },
  PAUSED: { label: 'Pausada', tone: 'warning', help: 'La pasarela pausó los cobros. Quien administra la iglesia tiene que revisar el medio de pago.' },
  GRACE: { label: 'En plazo', tone: 'accent', help: 'No tiene suscripción activa, pero todavía está dentro de su plazo o de un período ya pagado.' },
  BLOCKED: { label: 'Bloqueada', tone: 'danger', help: 'Sin suscripción ni plazo vigente: sus usuarios no pueden usar la app hasta que pague o la eximas.' },
  NO_GATEWAY: { label: 'Sin pasarela', tone: 'neutral', help: 'Su pasarela no está configurada en el servidor, así que no se le exige pago.' },
  EXEMPT: { label: 'Exenta', tone: 'success', help: 'No necesita suscripción.' },
  CLOSING: { label: 'En baja', tone: 'neutral', help: 'Tiene la baja programada: ya no se le cobra.' },
};

export const GATEWAY_LABEL: Record<Gateway, string> = { MERCADOPAGO: 'Mercado Pago', PAYPAL: 'PayPal' };

export const SUBSCRIPTION_LABEL: Record<SubscriptionStatus, string> = {
  ACTIVE: 'Activa',
  PAUSED: 'Pausada',
  PENDING: 'Sin confirmar',
  CANCELLED: 'Cancelada',
};
