'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarCheck, CalendarClock, Check, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/dialog';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Select, Tabs, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { APPOINTMENT_STATUS_LABEL, dateTime, fullName, roleNames, WEEKDAYS } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { Appointment, AppointmentStatus, Availability, Host } from '@/lib/types';

type Tab = 'book' | 'mine' | 'hosting' | 'availability' | 'all';

const STATUS_TONE: Record<AppointmentStatus, 'warning' | 'success' | 'neutral' | 'accent'> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  CANCELLED: 'neutral',
  COMPLETED: 'accent',
};

export default function AppointmentsPage() {
  const { me } = useSession();
  const isHost = can.host(me);
  const [tab, setTab] = useState<Tab>(isHost ? 'hosting' : 'book');

  const items: { value: Tab; label: string }[] = [
    ...(isHost ? [{ value: 'hosting' as Tab, label: 'Mi agenda' }, { value: 'availability' as Tab, label: 'Disponibilidad' }] : []),
    { value: 'book', label: 'Agendar' },
    { value: 'mine', label: 'Mis citas' },
    ...(can.allAppointments(me) ? [{ value: 'all' as Tab, label: 'Todas' }] : []),
  ];

  return (
    <>
      <PageHeader title="Citas" description="Reservá un horario con el pastor, el equipo pastoral o un líder de la iglesia." />
      <div className="-mx-4 mb-6 overflow-x-auto px-4">
        <Tabs value={tab} onChange={setTab} items={items} />
      </div>
      {tab === 'book' && <BookTab onBooked={() => setTab('mine')} />}
      {tab === 'mine' && <AppointmentList scope="mine" />}
      {tab === 'hosting' && <AppointmentList scope="hosting" />}
      {tab === 'all' && <AppointmentList scope="all" />}
      {tab === 'availability' && <AvailabilityEditor />}
    </>
  );
}

// Reservar

interface SlotDay {
  day: string;
  slots: { startsAt: string; endsAt: string; time: string }[];
}

function BookTab({ onBooked }: { onBooked: () => void }) {
  const { me } = useSession();
  const { data: hosts, isLoading } = useQuery({ queryKey: ['hosts'], queryFn: () => api<Host[]>('/users/hosts') });
  const available = useMemo(() => (hosts ?? []).filter((h) => h.id !== me.id && h._count.availability > 0), [hosts, me.id]);
  const [hostId, setHostId] = useState<string>('');
  const [picked, setPicked] = useState<SlotDay['slots'][number] | null>(null);

  useEffect(() => {
    if (!hostId && available[0]) setHostId(available[0].id);
  }, [available, hostId]);

  const slots = useQuery({
    queryKey: ['slots', hostId],
    queryFn: () => api<{ days: SlotDay[] }>('/appointments/slots', { query: { hostId, days: 21 } }),
    enabled: !!hostId,
  });
  const days = (slots.data?.days ?? []).filter((d) => d.slots.length > 0);
  const host = available.find((h) => h.id === hostId);

  if (isLoading) return <Loading />;
  if (!available.length) {
    return (
      <Card>
        <EmptyState icon={<CalendarClock className="size-5" />} title="No hay pastores con horarios disponibles" description="Cuando un pastor o líder cargue su disponibilidad vas a poder reservar acá." />
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="h-fit p-5">
        <p className="text-sm font-medium">¿Con quién querés reunirte?</p>
        <div className="mt-3 space-y-2">
          {available.map((h) => (
            <button
              key={h.id}
              onClick={() => setHostId(h.id)}
              className={clsx(
                'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition',
                hostId === h.id ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2',
              )}
            >
              <Avatar name={h} />
              <div>
                <p className="text-sm font-medium">{fullName(h)}</p>
                <p className="text-xs text-muted">{roleNames(h)}</p>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Horarios disponibles" description={host ? `Próximas 3 semanas con ${fullName(host)}` : undefined} />
        {slots.isLoading ? (
          <Loading />
        ) : slots.error ? (
          <ErrorState error={slots.error} onRetry={slots.refetch} />
        ) : days.length === 0 ? (
          <EmptyState title="No quedan horarios libres" description="Probá con otro pastor o líder, o volvé más adelante." />
        ) : (
          <div className="divide-y divide-border">
            {days.map((d) => (
              <div key={d.day} className="px-5 py-4">
                <p className="mb-2.5 text-sm font-medium capitalize">{dateTime(`${d.day}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</p>
                <div className="flex flex-wrap gap-2">
                  {d.slots.map((s) => (
                    <button
                      key={s.startsAt}
                      onClick={() => setPicked(s)}
                      className="tabular rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition hover:border-accent hover:bg-accent-soft hover:text-accent-ink"
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {picked && host && <ConfirmBooking host={host} slot={picked} onClose={() => setPicked(null)} onBooked={onBooked} />}
    </div>
  );
}

function ConfirmBooking({ host, slot, onClose, onBooked }: { host: Host; slot: { startsAt: string }; onClose: () => void; onBooked: () => void }) {
  const [reason, setReason] = useState('');
  const book = useAction(() => api('/appointments', { method: 'POST', body: { hostId: host.id, startsAt: slot.startsAt, reason: reason || undefined } }), {
    success: 'Cita solicitada. Te avisaremos cuando sea confirmada.',
    invalidate: [['appointments'], ['slots'], ['dashboard']],
    onSuccess: () => {
      onClose();
      onBooked();
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Confirmar cita"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => book.mutate()} loading={book.isPending}>
            Solicitar cita
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
        <Avatar name={host} />
        <div>
          <p className="text-sm font-medium">{fullName(host)}</p>
          <p className="text-sm text-muted capitalize">{dateTime(slot.startsAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} hs</p>
        </div>
      </div>
      <Field label="Motivo (opcional)" className="mt-4" hint="Solo lo verá la persona con quien te reunís.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="Ej.: consejería, oración, consulta sobre bautismo…" />
      </Field>
    </Dialog>
  );
}

// Listados

function AppointmentList({ scope }: { scope: 'mine' | 'hosting' | 'all' }) {
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['appointments', scope, when],
    queryFn: () => api<Appointment[]>('/appointments', { query: { scope, when } }),
  });
  const [notesFor, setNotesFor] = useState<Appointment | null>(null);
  const status = useAction(({ id, status, hostNotes }: { id: string; status: AppointmentStatus; hostNotes?: string }) =>
    api(`/appointments/${id}/status`, { method: 'PATCH', body: { status, hostNotes } }), {
    success: 'Cita actualizada',
    invalidate: [['appointments'], ['slots'], ['dashboard']],
    onSuccess: () => setNotesFor(null),
  });

  const asHost = scope !== 'mine';

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <Tabs
          value={when}
          onChange={setWhen}
          items={[
            { value: 'upcoming', label: 'Próximas' },
            { value: 'past', label: 'Pasadas' },
          ]}
        />
      </div>
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState icon={<CalendarCheck className="size-5" />} title={when === 'upcoming' ? 'No hay citas próximas' : 'No hay citas anteriores'} />
      ) : (
        <ul className="divide-y divide-border">
          {data.map((a) => {
            const other = asHost ? a.requester : a.host;
            const open = a.status === 'PENDING' || a.status === 'CONFIRMED';
            return (
              <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={other} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {fullName(other)}
                      {scope === 'all' && <span className="font-normal text-muted"> con {fullName(a.host)}</span>}
                    </p>
                    <p className="text-sm text-muted capitalize">{dateTime(a.startsAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} hs</p>
                    {a.reason && <p className="mt-1 text-sm text-muted">“{a.reason}”</p>}
                    {asHost && a.requester.phone && <p className="mt-0.5 text-xs text-subtle">Tel. {a.requester.phone}</p>}
                    {asHost && a.hostNotes && <p className="mt-1 text-xs text-subtle">Notas: {a.hostNotes}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Badge tone={STATUS_TONE[a.status]}>{APPOINTMENT_STATUS_LABEL[a.status]}</Badge>
                  {open && asHost && a.status === 'PENDING' && (
                    <Button size="sm" onClick={() => status.mutate({ id: a.id, status: 'CONFIRMED' })}>
                      <Check className="size-4" /> Confirmar
                    </Button>
                  )}
                  {open && asHost && a.status === 'CONFIRMED' && when === 'past' && (
                    <Button size="sm" variant="secondary" onClick={() => setNotesFor(a)}>
                      Marcar realizada
                    </Button>
                  )}
                  {open && (
                    <Button size="sm" variant="ghost" onClick={() => status.mutate({ id: a.id, status: 'CANCELLED' })}>
                      <X className="size-4" /> Cancelar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {notesFor && <CompleteDialog appt={notesFor} onClose={() => setNotesFor(null)} onSubmit={(hostNotes) => status.mutate({ id: notesFor.id, status: 'COMPLETED', hostNotes })} loading={status.isPending} />}
    </Card>
  );
}

function CompleteDialog({ appt, onClose, onSubmit, loading }: { appt: Appointment; onClose: () => void; onSubmit: (notes: string) => void; loading: boolean }) {
  const [notes, setNotes] = useState(appt.hostNotes ?? '');
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Cita realizada"
      description={fullName(appt.requester)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onSubmit(notes)} loading={loading}>
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Notas privadas (opcional)" hint="Solo visibles para quien atiende la cita y el pastor.">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
      </Field>
    </Dialog>
  );
}

// Disponibilidad

function AvailabilityEditor() {
  const { data, isLoading } = useQuery({ queryKey: ['availability'], queryFn: () => api<Availability[]>('/appointments/availability/me') });
  const [rows, setRows] = useState<Availability[] | null>(null);
  useEffect(() => {
    if (data && rows === null) setRows(data.map(({ weekday, startTime, endTime, slotMinutes }) => ({ weekday, startTime, endTime, slotMinutes })));
  }, [data, rows]);

  const save = useAction(() => api('/appointments/availability/me', { method: 'PUT', body: { slots: rows } }), {
    success: 'Disponibilidad guardada',
    invalidate: [['availability'], ['hosts'], ['slots']],
  });

  if (isLoading || !rows) return <Loading />;

  const update = (i: number, patch: Partial<Availability>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Card>
      <CardHeader
        title="Horarios semanales"
        description="Los miembros podrán reservar turnos dentro de estas franjas (hora de la iglesia)."
        action={
          <Button size="sm" variant="secondary" onClick={() => setRows([...rows, { weekday: 1, startTime: '18:00', endTime: '20:00', slotMinutes: 30 }])}>
            <Plus className="size-4" /> Agregar franja
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No cargaste horarios" description="Agregá al menos una franja para empezar a recibir citas." />
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 items-end gap-3 px-5 py-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
              <Field label="Día">
                <Select value={r.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })}>
                  {WEEKDAYS.map((d, n) => (
                    <option key={d} value={n}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Desde">
                <Input type="time" value={r.startTime} onChange={(e) => update(i, { startTime: e.target.value })} />
              </Field>
              <Field label="Hasta">
                <Input type="time" value={r.endTime} onChange={(e) => update(i, { endTime: e.target.value })} />
              </Field>
              <Field label="Duración">
                <Select value={r.slotMinutes} onChange={(e) => update(i, { slotMinutes: Number(e.target.value) })}>
                  {[15, 20, 30, 45, 60, 90].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </Select>
              </Field>
              <Button variant="ghost" className="justify-self-start" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Quitar franja">
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end border-t border-border px-5 py-4">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Guardar disponibilidad
        </Button>
      </div>
    </Card>
  );
}
