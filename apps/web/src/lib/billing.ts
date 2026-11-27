import { api } from './api';
import type { Currency } from './types';

export interface BillingAccess {
  blocked: boolean;
  /** Falso mientras la iglesia espera su primera activación. */
  activated: boolean;
  /** Hasta cuándo está activa. Sin fecha: exenta, en baja o sin activar. */
  until: string | null;
  /** Falta poco para el vencimiento: hay que preparar la donación. */
  reminder: boolean;
}

export interface Donation {
  id: string;
  amount: number | null;
  currency: Currency | null;
  receivedAt: string;
  coversUntil: string;
}

export interface Billing {
  access: BillingAccess;
  /** WhatsApp para coordinar la donación; null si no está configurado. */
  supportWhatsapp: string | null;
  donations: Donation[];
}

/**
 * Texto del recordatorio que ve quien administra la iglesia cuando la donación está por vencer.
 * `{dias}` se reemplaza por los días que faltan ("1 día", "5 días").
 */
export const REMINDER_MESSAGE = `Valoramos la colaboración y el compromiso que han tomado al apoyar y ser parte de este hermoso proyecto que es Kahal. Por eso, queremos recordarles que los fondos aportados a la aplicación son utilizados pura y exclusivamente para sostener sus propios gastos operativos.

Queremos recordarles por este medio que en {dias} vence el aporte con el que se han comprometido. A través de su apoyo mensual, hemos podido sostener Kahal y entregarlo de manera gratuita a otras congregaciones que no tienen la capacidad de pagar por una aplicación como esta.

Para renovar su compromiso, les pedimos enviar al número de WhatsApp el importe con el que van a participar.

¡Dios les bendiga grandemente y nos permita alcanzar más congregaciones!`;

/** Días que faltan hasta el vencimiento, contando el día en curso como uno. */
export function daysLeftLabel(until: string) {
  const days = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 86_400_000));
  return days === 1 ? '1 día' : `${days} días`;
}

/** Mensajes con los que se abre la conversación de WhatsApp, según desde dónde se escribe. */
export const WHATSAPP_MESSAGES = {
  registration: (church: string) => `Hola, acabo de solicitar el alta de la iglesia ${church} en Kahal y quiero coordinar la donación para activarla.`,
  activation: (church: string) => `Hola, quiero coordinar la donación para activar la iglesia ${church} en Kahal.`,
  renewal: (church: string) => `Hola, quiero coordinar el apoyo mensual de la iglesia ${church} en Kahal.`,
};

export function whatsappUrl(phone: string, message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export const billingQuery = { queryKey: ['billing'], queryFn: () => api<Billing>('/billing') };
export const accessQuery = { queryKey: ['billing-access'], queryFn: () => api<BillingAccess>('/billing/access'), staleTime: 60_000 };
/** Sin sesión: lo usa el formulario de alta. */
export const contactQuery = { queryKey: ['billing-contact'], queryFn: () => api<{ whatsapp: string | null }>('/public/billing/contact'), staleTime: Infinity };
