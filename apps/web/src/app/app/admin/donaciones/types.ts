import type { BillingAccess } from '@/lib/billing';
import type { Currency } from '@/lib/types';

export type AdminBillingState = 'PENDING' | 'EXPIRED' | 'DUE' | 'ACTIVE' | 'EXEMPT' | 'CLOSING';

export interface AdminBillingChurch {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  active: boolean;
  createdAt: string;
  defaultCurrency: Currency;
  billingExempt: boolean;
  billingExemptNote: string | null;
  billingActiveUntil: string | null;
  deletionScheduledFor: string | null;
  state: AdminBillingState;
  access: BillingAccess;
  lastDonation: { amount: number | null; currency: Currency | null; receivedAt: string } | null;
}

export interface AdminBilling {
  churches: AdminBillingChurch[];
  /** Lo donado en el mes en curso, por moneda. */
  monthly: Partial<Record<Currency, number>>;
}

export interface AdminDonation {
  id: string;
  amount: number | null;
  currency: Currency | null;
  receivedAt: string;
  coversUntil: string;
  note: string | null;
  createdAt: string;
}

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export const STATE: Record<AdminBillingState, { label: string; tone: Tone; help: string }> = {
  PENDING: { label: 'Sin activar', tone: 'accent', help: 'Todavía no se activó: sus usuarios ven el aviso para coordinar la donación por WhatsApp.' },
  EXPIRED: { label: 'Vencida', tone: 'danger', help: 'Venció su activación: sus usuarios no pueden usar la app hasta que registres una donación o la eximas.' },
  DUE: { label: 'Por vencer', tone: 'warning', help: 'Vence en pocos días: quien la administra ve el recordatorio para preparar la donación.' },
  ACTIVE: { label: 'Activa', tone: 'success', help: 'Tiene la donación al día.' },
  EXEMPT: { label: 'Exenta', tone: 'success', help: 'No necesita donación.' },
  CLOSING: { label: 'En baja', tone: 'neutral', help: 'Tiene la baja programada: puede usar la app para exportar sus datos.' },
};
