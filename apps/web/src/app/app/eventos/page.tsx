'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, CalendarDays, Clock, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { CalendarSubscribeDialog } from '@/components/calendar-subscribe';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { ImageUpload } from '@/components/image-upload';
import { ActionMenu } from '@/components/menu';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Textarea } from '@/components/ui';
import { api, fileUrl } from '@/lib/api';
import { dateTime, fromLocalInput, toLocalInput } from '@/lib/format';
import { formValues, useAction } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { ChurchEvent } from '@/lib/types';

export default function EventsPage() {
  const { me } = useSession();
  const editor = can.content(me);
  const [editing, setEditing] = useState<ChurchEvent | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ChurchEvent | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['events'], queryFn: () => api<ChurchEvent[]>('/events') });
  const remove = useAction((id: string) => api(`/events/${id}`, { method: 'DELETE' }), {
    success: 'Evento eliminado',
    invalidate: [['events'], ['dashboard']],
    onSuccess: () => setDeleting(null),
  });

  const groups = useMemo(() => {
    const m = new Map<string, ChurchEvent[]>();
    for (const e of data ?? []) {
      const key = dateTime(e.startsAt, { month: 'long', year: 'numeric' });
      m.set(key, [...(m.get(key) ?? []), e]);
    }
    return [...m.entries()];
  }, [data]);

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Cultos, reuniones y actividades de la iglesia."
        actions={
          <>
            {/* El feed es por cuenta: el super admin no pertenece a ninguna iglesia. */}
            {me.church && (
              <Button variant="secondary" onClick={() => setSubscribing(true)}>
                <CalendarPlus className="size-4" /> Agregar a mi calendario
              </Button>
            )}
            {editor && (
              <Button onClick={() => setEditing('new')}>
                <Plus className="size-4" /> Nuevo evento
              </Button>
            )}
          </>
        }
      />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarDays className="size-5" />} title="No hay actividades programadas" />
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map(([month, events]) => (
            <section key={month}>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted capitalize">{month}</h2>
              <div className="space-y-3">
                {events.map((e) => (
                  <Card key={e.id} className="flex gap-4 p-4 sm:p-5">
                    <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-accent-soft py-2 text-accent-ink">
                      <span className="text-[11px] font-semibold uppercase">{dateTime(e.startsAt, { weekday: 'short' }).replace('.', '')}</span>
                      <span className="tabular text-2xl leading-tight font-semibold">{dateTime(e.startsAt, { day: 'numeric' })}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">{e.title}</h3>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                            <span className="flex items-center gap-1">
                              <Clock className="size-3.5" />
                              {dateTime(e.startsAt, { hour: '2-digit', minute: '2-digit' })}
                              {e.endsAt && ` – ${dateTime(e.endsAt, { hour: '2-digit', minute: '2-digit' })}`} hs
                            </span>
                            {e.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="size-3.5" /> {e.location}
                              </span>
                            )}
                          </div>
                        </div>
                        {editor && (
                          <div className="flex items-center gap-2">
                            {!e.isPublic && <Badge>Solo miembros</Badge>}
                            <ActionMenu
                              items={[
                                { label: 'Editar', icon: Pencil, onClick: () => setEditing(e) },
                                { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setDeleting(e) },
                              ]}
                            />
                          </div>
                        )}
                      </div>
                      {e.description && <p className="mt-2 text-sm whitespace-pre-line text-muted">{e.description}</p>}
                      {e.imageKey && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fileUrl(e.imageKey)} alt="" className="mt-3 max-h-56 rounded-lg object-cover" />
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {subscribing && <CalendarSubscribeDialog onClose={() => setSubscribing(false)} />}
      {editing && <EventForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        danger
        title="Eliminar evento"
        message={`¿Eliminar "${deleting?.title}"?`}
        confirmLabel="Eliminar"
      />
    </>
  );
}

function EventForm({ item, onClose }: { item: ChurchEvent | null; onClose: () => void }) {
  const save = useAction(
    (body: Record<string, unknown>) => (item ? api(`/events/${item.id}`, { method: 'PATCH', body }) : api('/events', { method: 'POST', body })),
    { success: item ? 'Evento actualizado' : 'Evento creado', invalidate: [['events'], ['dashboard']], onSuccess: onClose },
  );

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    save.mutate({ ...v, startsAt: fromLocalInput(v.startsAt as string), endsAt: fromLocalInput(v.endsAt as string) });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? 'Editar evento' : 'Nuevo evento'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="event-form" loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Título">
          <Input name="title" required minLength={2} defaultValue={item?.title} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Inicio">
            <Input name="startsAt" type="datetime-local" required defaultValue={toLocalInput(item?.startsAt)} />
          </Field>
          <Field label="Fin (opcional)">
            <Input name="endsAt" type="datetime-local" defaultValue={toLocalInput(item?.endsAt)} />
          </Field>
        </div>
        <Field label="Lugar">
          <Input name="location" defaultValue={item?.location ?? ''} />
        </Field>
        <Field label="Descripción">
          <Textarea name="description" rows={4} defaultValue={item?.description ?? ''} />
        </Field>
        <ImageUpload name="imageKey" defaultKey={item?.imageKey} />
        <Checkbox name="isPublic" label="Mostrar en la página pública de la iglesia" defaultChecked={item?.isPublic ?? true} />
      </form>
    </Dialog>
  );
}
