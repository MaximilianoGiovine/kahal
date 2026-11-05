'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, CalendarDays, HandCoins, Megaphone, Pin, Radio, UserPlus, Users } from 'lucide-react';
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
  people?: { members: number; newMembers: number };
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

  const currency = church?.defaultCurrency ?? 'ARS';
  const fin = (type: 'INCOME' | 'EXPENSE') => data.finance?.rows.find((r) => r.currency === currency && r.type === type)?.total ?? '0';

  const next = data.events[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-tight sm:text-[2.25rem]">
          {greeting()}, <span className="font-semibold text-muted">{me.firstName}</span>
        </h1>
      </div>

      <Hero live={data.live} next={next} />

      {(data.people || data.finance) && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {data.people && (
            <>
              <Stat label="Miembros activos" value={number(data.people.members)} icon={<Users />} />
              <Stat label="Nuevos este mes" value={number(data.people.newMembers)} icon={<UserPlus />} />
            </>
          )}
          {data.finance && (
            <Link href="/app/finanzas" className="col-span-2 rounded-2xl transition hover:brightness-110 lg:col-span-1">
              <Stat
                label={`Resultado ${monthLabel(data.finance.month, 'long')}`}
                value={money(Number(fin('INCOME')) - Number(fin('EXPENSE')), currency, { compact: true })}
                hint={
                  <>
                    Ingresos {money(fin('INCOME'), currency, { compact: true })} · Egresos {money(fin('EXPENSE'), currency, { compact: true })}
                  </>
                }
                icon={<HandCoins />}
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

/** Banner principal: la transmisión en vivo o, si no hay, la próxima actividad. Vidrio con una línea de luz. */
function Hero({ live, next }: { live: Stream | null; next?: ChurchEvent }) {
  const href = live ? '/app/en-vivo' : next ? '/app/eventos' : '/app/novedades';
  return (
    <Link href={href} className="glass group relative block overflow-hidden rounded-3xl p-6 sm:p-8">
      {/* Resplandor del acento y onda luminosa (decorativos) */}
      <span aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-accent opacity-30 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-accent-2 opacity-20 blur-3xl" />
      <svg aria-hidden viewBox="0 0 600 120" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full">
        <defs>
          <linearGradient id="hero-wave" x1="0" x2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="0.35" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <path
          d="M0 95 C 60 95, 90 70, 150 78 S 250 100, 300 72 S 400 30, 450 52 S 540 70, 600 20"
          fill="none"
          stroke="url(#hero-wave)"
          strokeWidth="2.5"
          style={{ filter: 'drop-shadow(0 0 6px var(--accent))' }}
        />
        {[150, 300, 450].map((x, i) => (
          <circle key={x} cx={x} cy={[78, 72, 52][i]} r="3.5" fill="var(--accent-ink)" style={{ filter: 'drop-shadow(0 0 5px var(--accent))' }} />
        ))}
      </svg>

      <div className="relative flex min-h-40 flex-col justify-between gap-6 pb-10 sm:flex-row sm:items-start sm:pb-12">
        <div className="max-w-xl">
          {live ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-danger/40 bg-danger-soft px-3 py-1 text-xs font-semibold tracking-wider text-danger uppercase">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-danger opacity-75" />
                <span className="relative size-2 rounded-full bg-danger" />
              </span>
              En vivo ahora
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
              {next ? <CalendarDays className="size-3.5" /> : <Megaphone className="size-3.5" />}
              {next ? 'Próxima actividad' : 'Tu comunidad'}
            </span>
          )}
          <p className="font-display mt-4 text-2xl leading-tight font-semibold sm:text-3xl">
            {live ? live.title : next ? next.title : 'Enterate de todo lo que pasa en tu iglesia'}
          </p>
          {!live && next && (
            <p className="mt-1.5 text-sm text-muted">
              {dateTime(next.startsAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} hs
              {next.location ? ` · ${next.location}` : ''}
            </p>
          )}
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm font-medium shadow-[inset_0_1px_0_var(--glass-highlight)] backdrop-blur transition group-hover:bg-surface-3">
          {live ? (
            <>
              <Radio className="size-4" /> Ver transmisión
            </>
          ) : next ? (
            'Ver agenda'
          ) : (
            'Ver novedades'
          )}
          <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
