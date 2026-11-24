import { api } from './api';
import type { Currency } from './types';

export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export interface BillingAccess {
  blocked: boolean;
  /** Fecha en que se bloqueará si nada cambia. */
  until: string | null;
}

export interface Billing {
  plan: { gateway: 'MERCADOPAGO' | 'PAYPAL'; label: string; currency: Currency; minAmount: number; available: boolean };
  current: {
    gateway: 'MERCADOPAGO' | 'PAYPAL';
    amount: number;
    currency: Currency;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    lastPaymentAt: string | null;
  } | null;
  access: BillingAccess;
  pending: boolean;
  /** Número para iglesias sin medios para aportar; null si no está configurado. */
  supportWhatsapp: string | null;
}

const NO_MEANS_MESSAGE = 'Hola, mi iglesia carece de los medios para apoyar el proyecto Kahal.';

export function supportWhatsappUrl(phone: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(NO_MEANS_MESSAGE)}`;
}

export const billingQuery = { queryKey: ['billing'], queryFn: () => api<Billing>('/billing') };
export const accessQuery = { queryKey: ['billing-access'], queryFn: () => api<BillingAccess>('/billing/access'), staleTime: 60_000 };
