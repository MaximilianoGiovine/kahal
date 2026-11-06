import { Currency, PaymentGateway } from '@prisma/client';

export interface BillingPlan {
  gateway: PaymentGateway;
  label: string;
  currency: Currency;
  /** Si cambia, hay que actualizar la cláusula 3 del contrato y subir su versión. */
  minAmount: number;
}

export const PLANS: Record<PaymentGateway, BillingPlan> = {
  MERCADOPAGO: { gateway: PaymentGateway.MERCADOPAGO, label: 'Mercado Pago', currency: Currency.ARS, minAmount: 20_000 },
  PAYPAL: { gateway: PaymentGateway.PAYPAL, label: 'PayPal', currency: Currency.USD, minAmount: 15 },
};

/** La iglesia no guarda su país: la zona horaria que eligió al darse de alta lo indica. */
export function planForTimezone(timezone: string): BillingPlan {
  return timezone.startsWith('America/Argentina/') ? PLANS.MERCADOPAGO : PLANS.PAYPAL;
}
