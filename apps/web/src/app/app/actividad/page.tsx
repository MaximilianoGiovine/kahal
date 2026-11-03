'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarClock, History, Search } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import { Avatar, Badge, Card, CardHeader, EmptyState, ErrorState, Input, Loading, PageHeader, Pagination, Select, Tabs, td, th } from '@/components/ui';
import { api } from '@/lib/api';
import { ACTIVITY_ACTION_LABEL, ACTIVITY_ENTITY_LABEL, APPOINTMENT_STATUS_LABEL, dateTime, fullName, roleNames } from '@/lib/format';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { ActivityAction, ActivityEntity, ActivityLog, Appointment, AppointmentStatus, Paged, Person } from '@/lib/types';

const ACTION_TONE: Record<ActivityAction, 'success' | 'accent' | 'danger'> = { CREATE: 'success', UPDATE: 'accent', DELETE: 'danger' };
const STATUS_TONE: Record<AppointmentStatus, 'warning' | 'success' | 'neutral' | 'accent'> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  CANCELLED: 'neutral',
  COMPLETED: 'accent',
};

/** Dónde ver el elemento afectado (si todavía existe). */
function entityHref(log: ActivityLog) {
  if (log.action === 'DELETE') return null;
  return { ANNOUNCEMENT: '/app/novedades', EVENT: '/app/eventos', STREAM: '/app/en-vivo', ARTICLE: `/app/articulos/${log.entityId}` }[log.entity];
}

export default function ActivityPage() {
  const { me } = useSession();
  const [tab, setTab] = useState<'changes' | 'appointments'>('changes');

  if (!can.activity(me)) return <ErrorState error={new Error('No tenés permisos para ver el registro de actividad')} />;

  return (
    <>
      <PageHeader title="Registro" description="Quién modificó el contenido de la iglesia y cuándo, y las citas de cada persona." />
      <div className="mb-6">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'changes', label: 'Cambios en el contenido' },
            { value: 'appointments', label: 'Citas por persona' },
          ]}
        />
      </div>
      {tab === 'changes' ? <ChangesTab /> : <AppointmentsTab />}
    </>
  );
}

// Cambios

const PAGE_SIZE = 30;

function ChangesTab() {
  const [entity, setEntity] = useState<ActivityEntity | ''>('ANNOUNCEMENT');
  const [userId, setUserId] = useState('');
  const [q, setQ] = useState('');
  const search = useDeferredValue(q);
  const [page, setPage] = useState(1);

  const { data: authors = [] } = useQuery({
    queryKey: ['activity', 'authors'],
    queryFn: () => api<{ id: string; firstName: string; lastName: string }[]>('/activity/authors'),
  });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['activity', entity, userId, search, page],
    queryFn: () => api<Paged<ActivityLog>>('/activity', { query: { entity, userId, q: search, page, pageSize: PAGE_SIZE } }),
    placeholderData: (p) => p,
  });

  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <Card>
      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[minmax(0,1fr)_12rem_14rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Buscar por título" className="pl-9" aria-label="Buscar" />
        </div>
        <Select value={entity} onChange={(e) => reset(setEntity)(e.target.value as ActivityEntity | '')} aria-label="Tipo de contenido">
          <option value="">Todo el contenido</option>
          <option value="ANNOUNCEMENT">Novedades</option>
          <option value="ARTICLE">Artículos</option>
          <option value="EVENT">Agenda</option>
          <option value="STREAM">Transmisiones</option>
        </Select>
        <Select value={userId} onChange={(e) => reset(setUserId)(e.target.value)} aria-label="Persona">
          <option value="">Todas las personas</option>
          {authors.map((a) => (
            <option key={a.id} value={a.id}>
              {fullName(a)}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.items.length === 0 ? (
        <EmptyState icon={<History className="size-5" />} title="Sin cambios registrados" description="Los cambios aparecen acá a medida que el equipo crea, edita o elimina contenido." />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead className="border-b border-border bg-surface-2/50">
                <tr>
                  <th className={th}>Cuándo</th>
                  <th className={th}>Quién</th>
                  <th className={th}>Acción</th>
                  <th className={th}>Elemento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-2/50">
                    <td className={`${td} tabular whitespace-nowrap text-muted`}>{dateTime(log.createdAt)}</td>
                    <td className={td}>
                      <Who log={log} />
                    </td>
                    <td className={td}>
                      <Badge tone={ACTION_TONE[log.action]}>{ACTIVITY_ACTION_LABEL[log.action]}</Badge>
                    </td>
                    <td className={td}>
                      <What log={log} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-border md:hidden">
            {data.items.map((log) => (
              <li key={log.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <Who log={log} />
                  <Badge tone={ACTION_TONE[log.action]}>{ACTIVITY_ACTION_LABEL[log.action]}</Badge>
                </div>
                <What log={log} />
                <p className="tabular text-xs text-subtle">{dateTime(log.createdAt)}</p>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

function Who({ log }: { log: ActivityLog }) {
  if (!log.user) return <span className="text-sm text-muted">Usuario eliminado</span>;
  return (
    <span className="flex items-center gap-2.5">
      <Avatar name={log.user} size={30} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{fullName(log.user)}</span>
        <span className="block text-xs text-muted">{roleNames(log.user)}</span>
      </span>
    </span>
  );
}

function What({ log }: { log: ActivityLog }) {
  const href = entityHref(log);
  return (
    <div className="max-w-md min-w-0">
      <p className="text-xs text-muted">{ACTIVITY_ENTITY_LABEL[log.entity]}</p>
      {href ? (
        <Link href={href} className="block truncate text-sm font-medium hover:text-accent-ink hover:underline">
          {log.title}
        </Link>
      ) : (
        <p className="truncate text-sm font-medium">{log.title}</p>
      )}
      {log.detail && <p className="text-xs text-muted">Cambió: {log.detail}</p>}
    </div>
  );
}

// Citas por persona

type GroupBy = 'host' | 'requester';

function AppointmentsTab() {
  const [when, setWhen] = useState<'upcoming' | 'past' | ''>('upcoming');
  const [status, setStatus] = useState<AppointmentStatus | ''>('');
  const [groupBy, setGroupBy] = useState<GroupBy>('host');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['appointments', 'all', when, status],
    queryFn: () => api<Appointment[]>('/appointments', { query: { scope: 'all', when, status } }),
  });

  const groups = useMemo(() => {
    const map = new Map<string, { person: Person; items: Appointment[] }>();
    for (const a of data ?? []) {
      const person = a[groupBy];
      const g = map.get(person.id) ?? { person, items: [] };
      g.items.push(a);
      map.set(person.id, g);
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length || fullName(a.person).localeCompare(fullName(b.person)));
  }, [data, groupBy]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs
          value={groupBy}
          onChange={setGroupBy}
          items={[
            { value: 'host', label: 'Por quien atiende' },
            { value: 'requester', label: 'Por quien solicita' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3 sm:ml-auto sm:w-96">
          <Select value={when} onChange={(e) => setWhen(e.target.value as typeof when)} aria-label="Período">
            <option value="upcoming">Próximas</option>
            <option value="past">Pasadas</option>
            <option value="">Todas</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus | '')} aria-label="Estado">
            <option value="">Todos los estados</option>
            {(Object.keys(APPOINTMENT_STATUS_LABEL) as AppointmentStatus[]).map((s) => (
              <option key={s} value={s}>
                {APPOINTMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarClock className="size-5" />} title="No hay citas con estos filtros" />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map(({ person, items }) => {
            const pending = items.filter((a) => a.status === 'PENDING').length;
            return (
              <Card key={person.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2.5">
                      <Avatar name={person} size={32} />
                      {fullName(person)}
                    </span>
                  }
                  description={`${items.length} ${items.length === 1 ? 'cita' : 'citas'}${pending ? ` · ${pending} pendiente${pending === 1 ? '' : 's'}` : ''}`}
                />
                <ul className="divide-y divide-border">
                  {items.map((a) => {
                    const other = groupBy === 'host' ? a.requester : a.host;
                    return (
                      <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            <span className="text-muted">{groupBy === 'host' ? 'Con' : 'Atiende'}</span> {fullName(other)}
                          </p>
                          <p className="tabular text-xs text-muted">{dateTime(a.startsAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                          {a.reason && <p className="mt-1 line-clamp-2 text-sm text-muted">{a.reason}</p>}
                        </div>
                        <Badge tone={STATUS_TONE[a.status]}>{APPOINTMENT_STATUS_LABEL[a.status]}</Badge>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
      {data && data.length >= 200 && <p className="mt-3 text-sm text-muted">Se muestran las primeras 200 citas: usá los filtros para acotar.</p>}
    </>
  );
}
