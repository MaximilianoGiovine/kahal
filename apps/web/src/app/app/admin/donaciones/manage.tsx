'use client';

import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { CurrencyOptions } from '@/components/currency-options';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { Badge, Button, Field, Input, Loading, Select, Textarea, td, th } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import type { Currency } from '@/lib/types';
import { STATE, type AdminBillingChurch, type AdminDonation } from './types';

const day = (iso: string | null | undefined) => dateTime(iso, { dateStyle: 'medium' });

/** Fecha local en formato de <input type="date">. */
function toDateInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Fin del día elegido, en la hora local de quien administra. */
const endOfDay = (value: string) => new Date(`${value}T23:59:59`).toISOString();

const MONTHS = [1, 3, 6, 12];

export function ManageDonations({ church: c, onClose }: { church: AdminBillingChurch; onClose: () => void }) {
  // La activación se ve también en el resumen y en la ficha de la iglesia.
  const invalidate = [['admin', 'billing'], ['admin', 'churches'], ['admin', 'overview']];
  const history = useQuery({
    queryKey: ['admin', 'billing', c.id, 'donations'],
    queryFn: () => api<AdminDonation[]>(`/admin/billing/churches/${c.id}/donations`),
  });
  const update = useAction((body: Record<string, unknown>) => api(`/admin/billing/churches/${c.id}`, { method: 'PATCH', body }), {
    success: 'Iglesia actualizada',
    invalidate,
  });
  const [deleting, setDeleting] = useState<AdminDonation | null>(null);
  const remove = useAction((id: string) => api(`/admin/billing/churches/${c.id}/donations/${id}`, { method: 'DELETE' }), {
    success: 'Donación quitada del historial',
    invalidate: [...invalidate, ['admin', 'billing', c.id, 'donations']],
    onSuccess: () => setDeleting(null),
  });

  const [note, setNote] = useState(c.billingExemptNote ?? '');
  const [activeUntil, setActiveUntil] = useState(c.billingActiveUntil ? toDateInput(new Date(c.billingActiveUntil)) : '');
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  return (
    <Dialog open onClose={onClose} title={c.name} description={`/${c.slug}${c.city ? ` · ${c.city}` : ''}`} size="lg">
      <div className="space-y-6">
        <section className="rounded-2xl bg-surface-2 p-4 text-sm">
          <Badge tone={STATE[c.state].tone}>{STATE[c.state].label}</Badge>
          <p className="mt-2 text-muted">{STATE[c.state].help}</p>
          {c.access.until && (
            <p className={c.access.blocked ? 'mt-1 text-danger' : 'mt-1'}>
              {c.access.blocked ? 'Venció el' : 'Activa hasta el'} {day(c.access.until)}.
            </p>
          )}
        </section>

        {!c.billingExempt && !c.deletionScheduledFor && <DonationForm church={c} onDone={() => history.refetch()} />}

        {!c.billingExempt && (
          <section className="space-y-3">
            <h3 className="font-display font-semibold">Corregir la fecha de activación</h3>
            <p className="text-sm text-muted">Cambia la fecha sin registrar una donación. Para activar o renovar, registra la donación arriba.</p>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Activa hasta" className="w-48">
                <Input type="date" value={activeUntil} onChange={(e) => setActiveUntil(e.target.value)} />
              </Field>
              <Button
                variant="secondary"
                size="sm"
                className="mb-0.5"
                loading={update.isPending}
                disabled={!activeUntil}
                onClick={() => update.mutate({ billingActiveUntil: endOfDay(activeUntil) })}
              >
                Guardar
              </Button>
              {c.billingActiveUntil && (
                <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => setConfirmDeactivate(true)}>
                  Desactivar
                </Button>
              )}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h3 className="font-display font-semibold">Exención</h3>
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
                  Quitar exención
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">La iglesia usa Kahal sin donar y nunca vence. Útil para iglesias de demostración, sin medios o con acuerdos especiales.</p>
              <Field label="Motivo (opcional)" hint="Solo lo ven los super administradores.">
                <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: iglesia rural sin ingresos fijos, acordado por WhatsApp" />
              </Field>
              <Button variant="secondary" size="sm" loading={update.isPending} onClick={() => update.mutate({ billingExempt: true, billingExemptNote: note })}>
                Eximir
              </Button>
            </>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-display font-semibold">Historial de donaciones</h3>
          {history.isLoading ? (
            <Loading />
          ) : !history.data?.length ? (
            <p className="text-sm text-muted">Todavía no tiene donaciones registradas.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={th}>Recibida</th>
                    <th className={th}>Importe</th>
                    <th className={th}>Activa hasta</th>
                    <th className={th}>Nota</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.data.map((d) => (
                    <tr key={d.id}>
                      <td className={`${td} text-muted`}>{day(d.receivedAt)}</td>
                      <td className={`${td} tabular`}>{d.amount !== null && d.currency ? money(d.amount, d.currency) : '—'}</td>
                      <td className={`${td} text-muted`}>{day(d.coversUntil)}</td>
                      <td className={`${td} max-w-48 truncate text-muted`} title={d.note ?? undefined}>
                        {d.note ?? '—'}
                      </td>
                      <td className={`${td} text-right`}>
                        <button type="button" onClick={() => setDeleting(d)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-danger" aria-label="Quitar del historial">
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={confirmDeactivate}
        title="Desactivar la iglesia"
        message={`${c.name} volverá a quedar pendiente de activación y sus usuarios no podrán usar la app hasta que registres una donación.`}
        confirmLabel="Desactivar"
        danger
        loading={update.isPending}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={() =>
          update.mutate(
            { billingActiveUntil: null },
            {
              onSuccess: () => {
                setActiveUntil('');
                setConfirmDeactivate(false);
              },
            },
          )
        }
      />
      <ConfirmDialog
        open={!!deleting}
        title="Quitar la donación"
        message="Se quita del historial, pero la fecha de activación no cambia. Si hace falta, corrígela aparte."
        confirmLabel="Quitar"
        danger
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </Dialog>
  );
}

/** Registra una donación coordinada por WhatsApp: activa la iglesia o extiende su plazo. */
function DonationForm({ church: c, onDone }: { church: AdminBillingChurch; onDone: () => void }) {
  // Se suma desde el vencimiento si todavía no pasó, para no perder días ya cubiertos.
  const base = () => {
    const until = c.access.until ? new Date(c.access.until) : null;
    return until && until.getTime() > Date.now() ? until : new Date();
  };
  const plus = (months: number) => {
    const d = base();
    d.setMonth(d.getMonth() + months);
    return toDateInput(d);
  };
  const [months, setMonths] = useState<number | null>(1);
  const [coversUntil, setCoversUntil] = useState(() => plus(1));
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>(c.defaultCurrency);
  const [receivedAt, setReceivedAt] = useState(() => toDateInput(new Date()));
  const [note, setNote] = useState('');
  const record = useAction((body: Record<string, unknown>) => api(`/admin/billing/churches/${c.id}/donations`, { method: 'POST', body }), {
    success: c.access.activated ? 'Donación registrada' : 'Iglesia activada',
    invalidate: [['admin', 'billing'], ['admin', 'churches']],
    onSuccess: () => {
      setAmount('');
      setNote('');
      onDone();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    record.mutate({
      coversUntil: endOfDay(coversUntil),
      receivedAt: new Date(`${receivedAt}T12:00:00`).toISOString(),
      ...(amount ? { amount: Number(amount), currency } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  }

  return (
    <section className="space-y-3">
      <h3 className="font-display font-semibold">{c.access.activated ? 'Registrar donación' : 'Activar la iglesia'}</h3>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border p-4">
        <div>
          <p className="mb-1.5 text-sm font-medium">Período que cubre</p>
          <div className="flex flex-wrap gap-2">
            {MONTHS.map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={months === m ? 'primary' : 'secondary'}
                onClick={() => {
                  setMonths(m);
                  setCoversUntil(plus(m));
                }}
              >
                {m === 1 ? '1 mes' : `${m} meses`}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Activa hasta" hint={c.access.until && !c.access.blocked ? 'Se suma desde el vencimiento actual.' : undefined}>
            <Input
              type="date"
              required
              min={toDateInput(new Date())}
              value={coversUntil}
              onChange={(e) => {
                setMonths(null);
                setCoversUntil(e.target.value);
              }}
            />
          </Field>
          <Field label="Recibida el">
            <Input type="date" required value={receivedAt} max={toDateInput(new Date())} onChange={(e) => setReceivedAt(e.target.value)} />
          </Field>
          <Field label="Importe (opcional)">
            <Input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Moneda">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} disabled={!amount}>
              <CurrencyOptions />
            </Select>
          </Field>
        </div>
        <Field label="Nota (opcional)" hint="Solo la ven los super administradores.">
          <Input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: transferencia, coordinada con el pastor" />
        </Field>
        <Button type="submit" loading={record.isPending} disabled={!coversUntil}>
          {c.access.activated ? 'Registrar donación' : 'Activar la iglesia'}
        </Button>
      </form>
    </section>
  );
}
