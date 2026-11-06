'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, ExternalLink } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ChurchClosure } from '@/components/church-closure';
import { ConfirmDialog } from '@/components/dialog';
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { accessQuery, billingQuery, type Billing, type SubscriptionStatus } from '@/lib/billing';
import { dayLabel, money } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';

const STATUS: Record<SubscriptionStatus, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  ACTIVE: { label: 'Activa', tone: 'success' },
  PAUSED: { label: 'Pausada', tone: 'warning' },
  PENDING: { label: 'Pendiente', tone: 'warning' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
};

export default function SubscriptionPage() {
  const { me, church } = useSession();
  const qc = useQueryClient();
  const allowed = can.churchSettings(me);
  const { data, isLoading, error, refetch } = useQuery({ ...billingQuery, enabled: allowed && !!church });
  const store = (next: Billing) => {
    qc.setQueryData(billingQuery.queryKey, next);
    qc.setQueryData(accessQuery.queryKey, next.access);
  };
  const refresh = useAction(() => api<Billing>('/billing/refresh', { method: 'POST' }), { onSuccess: store });
  const [confirming, setConfirming] = useState(false);
  const cancel = useAction(() => api<Billing>('/billing/cancel', { method: 'POST' }), {
    success: 'Suscripción cancelada',
    onSuccess: (next) => {
      store(next);
      setConfirming(false);
    },
  });

  // Al volver de la pasarela se consulta el resultado sin esperar su aviso.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('resultado');
    if (!result) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (result === 'cancelado') {
      toast.info('No se completó la suscripción');
      return;
    }
    api<Billing>('/billing/refresh', { method: 'POST' })
      .then((next) => {
        store(next);
        if (next.current?.status === 'ACTIVE' && !next.pending) toast.success('Suscripción activa');
      })
      .catch(() => toast.error('No pudimos consultar el pago. Revisa el estado en unos minutos.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) return <ErrorState error={new Error('No tienes permisos para gestionar la suscripción')} />;

  return (
    <>
      <PageHeader title="Suscripción" description="Elige cuánto quiere aportar tu iglesia cada mes. Todos los importes dan acceso a las mismas funciones." />
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className="mx-auto max-w-2xl space-y-5">
          {data.current && (
            <Card>
              <CardHeader title="Suscripción actual" action={<Badge tone={STATUS[data.current.status].tone}>{STATUS[data.current.status].label}</Badge>} />
              <div className="space-y-1 p-5 text-sm">
                <p className="font-display text-2xl font-semibold text-fg">
                  {money(data.current.amount, data.current.currency)} <span className="text-sm font-normal text-muted">por mes</span>
                </p>
                <p className="text-muted">Pagada con {data.current.gateway === 'MERCADOPAGO' ? 'Mercado Pago' : 'PayPal'}.</p>
                {data.current.currentPeriodEnd && (
                  <p className="text-muted">
                    {data.current.status === 'ACTIVE' ? 'Próximo cobro' : 'Cubierta hasta'}: {dayLabel(data.current.currentPeriodEnd, 'long')}.
                  </p>
                )}
                {data.current.status === 'PAUSED' && <p className="text-warning">La pasarela pausó los cobros. Revisa el medio de pago en tu cuenta o suscríbete de nuevo.</p>}
                {(data.current.status === 'ACTIVE' || data.current.status === 'PAUSED') && (
                  <Button variant="secondary" className="mt-3" onClick={() => setConfirming(true)}>
                    Cancelar la suscripción
                  </Button>
                )}
              </div>
            </Card>
          )}
          {data.access.blocked && (
            <p className="rounded-2xl bg-danger-soft p-4 text-sm text-danger">El acceso de tu iglesia está bloqueado temporalmente. Se restablece al activar la suscripción, y los datos se conservan.</p>
          )}
          {!data.access.blocked && data.access.until && data.plan.available && (
            <p className="rounded-2xl bg-warning-soft p-4 text-sm text-warning">Sin una suscripción activa, el acceso de tu iglesia se bloqueará el {dayLabel(data.access.until, 'long')}.</p>
          )}
          {data.pending && (
            <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 text-sm text-muted">
              <p className="min-w-0 flex-1">Hay un pago sin confirmar. Si ya lo hiciste, la pasarela puede tardar unos minutos en avisarnos.</p>
              <Button size="sm" variant="secondary" loading={refresh.isPending} onClick={() => refresh.mutate()}>
                Actualizar estado
              </Button>
            </div>
          )}
          <CheckoutForm key={`${data.current?.status}:${data.current?.amount}`} billing={data} defaultEmail={me.email} />
          {data.access.blocked && church && <ChurchClosure church={{ slug: church.slug, deletionScheduledFor: null }} />}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title="Cancelar la suscripción"
        message="No habrá más cobros. Lo ya pagado no se devuelve y sigue vigente hasta el final del período."
        confirmLabel="Cancelar la suscripción"
        danger
        loading={cancel.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => cancel.mutate()}
      />
    </>
  );
}

function CheckoutForm({ billing, defaultEmail }: { billing: Billing; defaultEmail: string }) {
  const { plan, current } = billing;
  const subscribed = current?.status === 'ACTIVE';
  const [amount, setAmount] = useState(String(subscribed && current.currency === plan.currency ? current.amount : plan.minAmount));
  const [payerEmail, setPayerEmail] = useState(defaultEmail);
  const checkout = useAction((body: { amount: number; payerEmail?: string }) => api<{ url: string }>('/billing/checkout', { method: 'POST', body }), {
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const mercadoPago = plan.gateway === 'MERCADOPAGO';
  const value = Number(amount);
  const belowMinimum = !Number.isFinite(value) || value < plan.minAmount;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!belowMinimum) checkout.mutate({ amount: value, ...(mercadoPago ? { payerEmail } : {}) });
  }

  if (!plan.available) {
    return (
      <Card className="p-5 text-sm text-muted">
        <p className="font-medium text-fg">Todavía no se puede suscribir</p>
        <p className="mt-1">{plan.label} aún no está habilitado para tu iglesia. Te avisaremos cuando puedas activar la suscripción.</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={subscribed ? 'Cambiar el importe' : 'Activar la suscripción'} description={`Se paga con ${plan.label} y se cobra todos los meses hasta que la canceles.`} />
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label={`Importe mensual en ${plan.currency}`} hint={`El mínimo es de ${money(plan.minAmount, plan.currency)}.`}>
          <Input type="number" inputMode="decimal" min={plan.minAmount} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {mercadoPago && (
          <Field label="Correo de tu cuenta de Mercado Pago" hint="Debe ser el de la cuenta con la que vas a pagar. Si no coincide, Mercado Pago rechaza el pago.">
            <Input type="email" required value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} />
          </Field>
        )}
        {subscribed && <p className="text-sm text-muted">El nuevo importe se cobra desde el próximo período. Lo que ya pagaste no se cobra de nuevo.</p>}
        <Button type="submit" loading={checkout.isPending} disabled={belowMinimum}>
          <CreditCard className="size-4" /> Continuar a {plan.label} <ExternalLink className="size-4" />
        </Button>
      </form>
    </Card>
  );
}
