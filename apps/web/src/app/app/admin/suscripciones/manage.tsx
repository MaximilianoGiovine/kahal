'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { Badge, Button, Checkbox, Field, Input, Loading, Textarea, td, th } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { GATEWAY_LABEL, STATE, SUBSCRIPTION_LABEL, type AdminBillingChurch, type AdminSubscription } from './types';

const day = (iso: string | null | undefined) => dateTime(iso, { dateStyle: 'medium' });

/** Fecha local en formato de <input type="date">. */
function toDateInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function ManageSubscription({ church: c, onClose }: { church: AdminBillingChurch; onClose: () => void }) {
  const invalidate = [['admin', 'billing'], ['admin', 'churches']];
  const history = useQuery({
    queryKey: ['admin', 'billing', c.id, 'history'],
    queryFn: () => api<AdminSubscription[]>(`/admin/billing/churches/${c.id}/subscriptions`),
  });
  const update = useAction((body: Record<string, unknown>) => api(`/admin/billing/churches/${c.id}`, { method: 'PATCH', body }), {
    success: 'Iglesia actualizada',
    invalidate,
  });
  const refresh = useAction(() => api(`/admin/billing/churches/${c.id}/refresh`, { method: 'POST' }), { success: 'Estado actualizado desde la pasarela', invalidate });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancel = useAction(() => api(`/admin/billing/churches/${c.id}/cancel`, { method: 'POST' }), {
    success: 'Suscripción cancelada',
    invalidate,
    onSuccess: () => setConfirmCancel(false),
  });

  const [note, setNote] = useState(c.billingExemptNote ?? '');
  const charging = c.current?.status === 'ACTIVE' || c.current?.status === 'PAUSED';
  const [stopCharging, setStopCharging] = useState(true);
  const [grace, setGrace] = useState(c.billingGraceUntil ? toDateInput(new Date(c.billingGraceUntil)) : '');
  const open = history.data?.some((s) => s.status !== 'CANCELLED') ?? false;

  const saveGrace = (value: string | null) => update.mutate({ billingGraceUntil: value ? new Date(`${value}T23:59:59`).toISOString() : null });
  const extend = (days: number) => {
    const base = Math.max(Date.now(), c.access.until ? new Date(c.access.until).getTime() : 0);
    const next = toDateInput(new Date(base + days * 86_400_000));
    setGrace(next);
    saveGrace(next);
  };

  return (
    <Dialog open onClose={onClose} title={c.name} description={`/${c.slug} · ${GATEWAY_LABEL[c.gateway]}${c.gatewayAvailable ? '' : ' (no configurada)'}`} size="lg">
      <div className="space-y-6">
        <section className="rounded-2xl bg-surface-2 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATE[c.state].tone}>{STATE[c.state].label}</Badge>
            {c.pending && <Badge>Pago sin confirmar</Badge>}
          </div>
          <p className="mt-2 text-muted">{STATE[c.state].help}</p>
          {c.current && (
            <p className="mt-2">
              {money(c.current.amount, c.current.currency)} por mes · {SUBSCRIPTION_LABEL[c.current.status]}
              {c.current.currentPeriodEnd && <span className="text-muted"> · cubierta hasta el {day(c.current.currentPeriodEnd)}</span>}
              {c.current.lastPaymentAt && <span className="text-muted"> · último pago el {day(c.current.lastPaymentAt)}</span>}
            </p>
          )}
          {c.access.until && <p className="mt-1 text-warning">Se bloquea el {day(c.access.until)} si no paga.</p>}
        </section>

        <section className="space-y-3">
          <h3 className="font-display font-semibold">Exención de pago</h3>
          {c.billingExempt ? (
            <>
              <Field label="Motivo" hint="Solo lo ven los super administradores.">
                <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" loading={update.isPending} disabled={note === (c.billingExemptNote ?? '')} onClick={() => update.mutate({ billingExemptNote: note })}>
                  Guardar motivo
                </Button>
                <Button variant="secondary" size="sm" loading={update.isPending} onClick={() => update.mutate({ billingExempt: false })}>
                  Exigir pago
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">La iglesia usa Kahal sin pagar y no se bloquea. Útil para instituciones sin medios o acuerdos especiales.</p>
              <Field label="Motivo (opcional)" hint="Solo lo ven los super administradores.">
                <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: iglesia rural sin ingresos fijos, acordado por WhatsApp" />
              </Field>
              {charging && <Checkbox label="Cancelar también la suscripción que está cobrando" checked={stopCharging} onChange={(e) => setStopCharging(e.target.checked)} />}
              <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ billingExempt: true, billingExemptNote: note, cancelSubscriptions: charging && stopCharging })}>
                Eximir de pago
              </Button>
            </>
          )}
        </section>

        {!c.billingExempt && (
          <section className="space-y-3">
            <h3 className="font-display font-semibold">Plazo sin suscripción</h3>
            <p className="text-sm text-muted">Hasta esa fecha la iglesia funciona aunque no pague. Si ya pagó un período más largo, vale el más largo.</p>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Funciona sin pagar hasta" className="w-48">
                <Input type="date" value={grace} min={toDateInput(new Date())} onChange={(e) => setGrace(e.target.value)} />
              </Field>
              <Button variant="secondary" size="sm" className="mb-0.5" loading={update.isPending} disabled={!grace} onClick={() => saveGrace(grace)}>
                Guardar
              </Button>
              <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => extend(30)}>
                +30 días
              </Button>
              {c.billingGraceUntil && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-0.5"
                  onClick={() => {
                    setGrace('');
                    saveGrace(null);
                  }}
                >
                  Quitar plazo
                </Button>
              )}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-semibold">Historial de suscripciones</h3>
            <div className="flex gap-2">
              {open && (
                <Button variant="secondary" size="sm" loading={refresh.isPending} onClick={() => refresh.mutate()}>
                  <RefreshCw className="size-4" /> Consultar a la pasarela
                </Button>
              )}
              {charging && (
                <Button variant="danger" size="sm" onClick={() => setConfirmCancel(true)}>
                  Cancelar suscripción
                </Button>
              )}
            </div>
          </div>
          {history.isLoading ? (
            <Loading />
          ) : !history.data?.length ? (
            <p className="text-sm text-muted">Nunca inició una suscripción.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={th}>Inicio</th>
                    <th className={th}>Importe</th>
                    <th className={th}>Estado</th>
                    <th className={th}>Último pago</th>
                    <th className={th}>Id en la pasarela</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.data.map((s) => (
                    <tr key={s.id}>
                      <td className={`${td} text-muted`}>{day(s.createdAt)}</td>
                      <td className={`${td} tabular`}>{money(s.amount, s.currency)}</td>
                      <td className={td}>
                        {SUBSCRIPTION_LABEL[s.status]}
                        {s.cancelledAt && <span className="block text-xs text-muted">el {day(s.cancelledAt)}</span>}
                      </td>
                      <td className={`${td} text-muted`}>{day(s.lastPaymentAt)}</td>
                      <td className={`${td} font-mono text-xs text-muted`}>{s.externalId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={confirmCancel}
        title="Cancelar la suscripción"
        message={`${c.name} no tendrá más cobros. Lo ya pagado sigue vigente hasta el final del período; después se bloquea salvo que la eximas o le des plazo.`}
        confirmLabel="Cancelar la suscripción"
        danger
        loading={cancel.isPending}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancel.mutate()}
      />
    </Dialog>
  );
}
