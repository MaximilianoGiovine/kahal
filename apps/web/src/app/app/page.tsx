'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, CalendarDays, HandCoins, Pin, Radio, UserCheck, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { DateChip } from '@/components/date-chip';
import { Badge, Card, CardHeader, EmptyState, ErrorState, Loading, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { APPOINTMENT_STATUS_LABEL, dateTime, money, monthLabel, number, relative } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Announcement, Appointment, ChurchEvent, Stream } from '@/lib/types';

interface Dashboard {
  announcements: Announcement[];
  events: ChurchEvent[];
  live: Stream | null;
  myAppointments: (Appointment & { host: { firstName: string; lastName: string } })[];
  people?: { members: number; newMembers: number; pending: number };
  finance?: { month: string; rows: { currency: string; type: 'INCOME' | 'EXPENSE'; total: string }[] };
  hosting?: (Appointment & { requester: { firstName: string; lastName: string } })[];
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

export default function DashboardPage() {
  const { me, church } = useSession();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  const fin = (type: 'INCOME' | 'EXPENSE') => data.finance?.rows.find((r) => r.currency === 'ARS' && r.type === type)?.total ?? '0';

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{church?.name}</p>
        <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting()}, {me.firstName}
        </h1>
      </div>

      {data.live && (
        <Link href="/app/en-vivo" className="group flex items-center gap-4 rounded-xl border border-danger/30 bg-danger-soft p-4 sm:p-5">
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-danger text-white">
            <Radio className="size-5" />
            <span className="absolute inset-0 animate-ping rounded-full bg-danger opacity-30" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wider text-danger uppercase">En vivo ahora</p>
            <p className="truncate font-medium">{data.live.title}</p>
          </div>
          <ArrowRight className="size-5 text-danger transition group-hover:translate-x-1" />
        </Link>
      )}

      {(data.people || data.finance) && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data.people && (
            <>
              <Stat label="Miembros activos" value={number(data.people.members)} icon={<Users className="size-4" />} />
              <Stat label="Nuevos este mes" value={number(data.people.newMembers)} icon={<UserPlus className="size-4" />} />
              <Link href="/app/solicitudes">
                <Stat
                  label="Solicitudes"
                  value={number(data.people.pending)}
                  hint={data.people.pending ? 'Pendientes de aprobación' : 'Sin pendientes'}
                  icon={<UserCheck className="size-4" />}
                />
              </Link>
            </>
          )}
          {data.finance && (
            <Link href="/app/finanzas">
              <Stat
                label={`Resultado ${monthLabel(data.finance.month, 'long')}`}
                value={money(Number(fin('INCOME')) - Number(fin('EXPENSE')), 'ARS', { compact: true })}
                hint={
                  <>
                    Ingresos {money(fin('INCOME'), 'ARS', { compact: true })} · Egresos {money(fin('EXPENSE'), 'ARS', { compact: true })}
                  </>
                }
                icon={<HandCoins className="size-4" />}
              />
            </Link>
          )}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Novedades"
            action={
              <Link href="/app/novedades" className="text-sm font-medium text-accent-ink hover:underline">
                Ver todas
              </Link>
            }
          />
          {data.announcements.length === 0 ? (
            <EmptyState title="Sin novedades por ahora" />
          ) : (
            <ul className="divide-y divide-border">
              {data.announcements.map((a) => (
                <li key={a.id} className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    {a.pinned && <Pin className="size-3.5 text-accent-ink" />}
                    <p className="font-medium">{a.title}</p>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{a.body}</p>
                  <p className="mt-1.5 text-xs text-subtle">{relative(a.publishedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {data.hosting && (
            <Card>
              <CardHeader
                title="Mis próximas citas"
                description="Como pastor / líder"
                action={
                  <Link href="/app/citas" className="text-sm font-medium text-accent-ink hover:underline">
                    Agenda
                  </Link>
                }
              />
              {data.hosting.length === 0 ? (
                <EmptyState title="Sin citas próximas" />
              ) : (
                <ul className="divide-y divide-border">
                  {data.hosting.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {a.requester.firstName} {a.requester.lastName}
                        </p>
                        <p className="text-xs text-muted">{dateTime(a.startsAt, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <Badge tone={a.status === 'CONFIRMED' ? 'success' : 'warning'}>{APPOINTMENT_STATUS_LABEL[a.status]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card>
            <CardHeader
              title="Próximas actividades"
              action={
                <Link href="/app/eventos" className="text-sm font-medium text-accent-ink hover:underline">
                  Agenda
                </Link>
              }
            />
            {data.events.length === 0 ? (
              <EmptyState icon={<CalendarDays className="size-5" />} title="No hay actividades programadas" />
            ) : (
              <ul className="divide-y divide-border">
                {data.events.map((e) => (
                  <li key={e.id} className="flex gap-4 px-5 py-3">
                    <DateChip iso={e.startsAt} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="truncate text-xs text-muted">
                        {dateTime(e.startsAt, { hour: '2-digit', minute: '2-digit' })} hs{e.location ? ` · ${e.location}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Mis citas"
              action={
                <Link href="/app/citas" className="text-sm font-medium text-accent-ink hover:underline">
                  Agendar
                </Link>
              }
            />
            {data.myAppointments.length === 0 ? (
              <EmptyState icon={<CalendarClock className="size-5" />} title="No tenés citas agendadas" description="Reservá un horario con tu pastor o líder." />
            ) : (
              <ul className="divide-y divide-border">
                {data.myAppointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {a.host.firstName} {a.host.lastName}
                      </p>
                      <p className="text-xs text-muted">{dateTime(a.startsAt, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <Badge tone={a.status === 'CONFIRMED' ? 'success' : 'warning'}>{APPOINTMENT_STATUS_LABEL[a.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
