'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, CheckCircle2, HeartHandshake, Inbox, MoonStar, Plus, UserRound, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { BarChart } from '@/components/bar-chart';
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, ErrorState, Loading, PageHeader, Stat, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, money, monthLabel, number, relative } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Currency } from '@/lib/types';
import { CreateChurch } from './create-church';
import { STATE, type AdminBillingState } from './donaciones/types';
import { STATE_COLOR, type AdminOverview, type MonthPoint } from './types';
import { CardLink, Row, Section } from './widgets';

const day = (iso: string | null | undefined) => dateTime(iso, { dateStyle: 'medium' });
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const amounts = (totals: Partial<Record<Currency, number>>) => (Object.entries(totals) as [Currency, number][]).map(([cur, v]) => money(v, cur));

export default function AdminOverviewPage() {
  const { isSuperAdmin } = useSession();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api<AdminOverview>('/admin/overview'), enabled: isSuperAdmin });

  if (!isSuperAdmin) return <ErrorState error={new Error('Solo disponible para super administradores')} />;

  const monthly = data ? amounts(data.billing.monthly) : [];

  return (
    <>
      <PageHeader
        title="Resumen"
        description="Cómo está Kahal en esta instalación y qué necesita tu atención."
        actions={
          <>
            <ButtonLink href="/app/admin/iglesias" variant="secondary">
              <Building2 className="size-4" /> Iglesias
            </ButtonLink>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Nueva iglesia
            </Button>
          </>
        }
      />
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={<Building2 />} label="Iglesias" value={number(data.totals.churches)} hint={`${number(data.totals.enabledChurches)} habilitadas`} />
            <Stat icon={<Users />} label="Miembros registrados" value={number(data.totals.members)} hint="En todas las iglesias" />
            <Stat
              icon={<UserRound />}
              label="Cuentas de usuario"
              value={number(data.totals.users)}
              hint={data.totals.pendingUsers ? `${number(data.totals.pendingUsers)} esperan aprobación de su iglesia` : 'Ninguna espera aprobación'}
            />
            <Stat icon={<HeartHandshake />} label="Donado este mes" value={monthly.length ? monthly.join(' · ') : '—'} hint="Suma de las donaciones registradas" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <GrowthCard growth={data.growth} />
            <StatesCard states={data.billing.states} />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <AttentionCard data={data} />
            <TopChurchesCard churches={data.topChurches} />
            <RecentDonationsCard donations={data.recentDonations} />
          </div>
        </div>
      )}
      {creating && <CreateChurch onClose={() => setCreating(false)} />}
    </>
  );
}

type Metric = 'users' | 'churches' | 'donations';
const METRIC: Record<Metric, { tab: string; series: string; aria: string }> = {
  users: { tab: 'Cuentas', series: 'Cuentas nuevas', aria: 'Cuentas de usuario creadas por mes' },
  churches: { tab: 'Iglesias', series: 'Iglesias nuevas', aria: 'Iglesias dadas de alta por mes' },
  donations: { tab: 'Donaciones', series: 'Donaciones', aria: 'Donaciones registradas por mes' },
};

function GrowthCard({ growth }: { growth: AdminOverview['growth'] }) {
  const [metric, setMetric] = useState<Metric>('users');
  const series: (MonthPoint & { totals?: Partial<Record<Currency, number>> })[] = growth[metric];
  const total = series.reduce((n, p) => n + p.count, 0);
  const current = series.at(-1)?.count ?? 0;
  const previous = series.at(-2)?.count ?? 0;

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Crecimiento"
        description={`${number(total)} en los últimos 12 meses · ${number(current)} este mes (${number(previous)} el anterior)`}
        action={<Tabs value={metric} onChange={setMetric} items={(Object.keys(METRIC) as Metric[]).map((m) => ({ value: m, label: METRIC[m].tab }))} />}
      />
      <div className="p-5">
        <BarChart
          key={metric}
          data={series.map((p) => ({
            key: p.month,
            value: p.count,
            tick: monthLabel(p.month),
            title: capitalize(monthLabel(p.month, 'long')),
            detail: p.totals ? (Object.entries(p.totals) as [Currency, number][]).map(([cur, v]) => ({ label: cur, value: money(v, cur) })) : undefined,
          }))}
          seriesLabel={METRIC[metric].series}
          ariaLabel={METRIC[metric].aria}
          periodLabel="Mes"
        />
      </div>
    </Card>
  );
}

const STATE_ORDER: AdminBillingState[] = ['EXPIRED', 'DUE', 'PENDING', 'ACTIVE', 'EXEMPT', 'CLOSING'];

function StatesCard({ states }: { states: Record<AdminBillingState, number> }) {
  const total = STATE_ORDER.reduce((n, s) => n + states[s], 0);
  const [hover, setHover] = useState<AdminBillingState | null>(null);
  const shown = STATE_ORDER.filter((s) => states[s] > 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <Card>
      <CardHeader title="Activación de las iglesias" description="Según sus donaciones y exenciones." action={<CardLink href="/app/admin/donaciones">Donaciones</CardLink>} />
      <div className="p-5">
        {total === 0 ? (
          <p className="text-sm text-muted">Todavía no hay iglesias.</p>
        ) : (
          <>
            <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Iglesias por estado de activación">
              {shown.map((s) => (
                <div
                  key={s}
                  className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${(states[s] / total) * 100}%`, background: STATE_COLOR[s], opacity: hover && hover !== s ? 0.35 : 1 }}
                  onMouseEnter={() => setHover(s)}
                  onMouseLeave={() => setHover(null)}
                  title={`${STATE[s].label}: ${number(states[s])}`}
                />
              ))}
            </div>
            <ul className="mt-5 space-y-1">
              {STATE_ORDER.map((s) => (
                <li key={s}>
                  <Link
                    href="/app/admin/donaciones"
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-2"
                    onMouseEnter={() => setHover(s)}
                    onMouseLeave={() => setHover(null)}
                    title={STATE[s].help}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: STATE_COLOR[s] }} aria-hidden />
                    <span className="flex-1">{STATE[s].label}</span>
                    <span className="tabular text-muted">{pct(states[s])} %</span>
                    <span className="tabular w-8 text-right font-medium">{number(states[s])}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

function AttentionCard({ data }: { data: AdminOverview }) {
  const { requests, billing, dormant } = data;
  const empty = requests.pending === 0 && billing.attention.length === 0 && dormant.churches.length === 0;

  return (
    <Card>
      <CardHeader title="Requieren atención" description="Lo más urgente primero." />
      {empty ? (
        <EmptyState icon={<CheckCircle2 className="size-5" />} title="Todo en orden" description="No hay solicitudes, vencimientos ni iglesias inactivas." />
      ) : (
        <div className="divide-y divide-border">
          {requests.pending > 0 && (
            <Section icon={<Inbox className="size-4" />} title={`Solicitudes de alta (${number(requests.pending)})`} href="/app/admin/iglesias?tab=solicitudes">
              {requests.oldest.map((r) => (
                <Row key={r.id} href="/app/admin/iglesias?tab=solicitudes" title={r.name} subtitle={`${r.adminFirstName} ${r.adminLastName}${r.city ? ` · ${r.city}` : ''}`} meta={relative(r.createdAt)} />
              ))}
            </Section>
          )}
          {billing.attention.length > 0 && (
            <Section icon={<AlertTriangle className="size-4" />} title={`Activación (${number(billing.attention.length)})`} href="/app/admin/donaciones">
              {billing.attention.slice(0, 6).map((c) => (
                <Row
                  key={c.id}
                  href={`/app/admin/iglesias/${c.id}`}
                  title={c.name}
                  subtitle={c.until ? `${c.state === 'EXPIRED' ? 'Venció' : 'Vence'} el ${day(c.until)}` : `Alta ${relative(c.createdAt)}`}
                  meta={<Badge tone={STATE[c.state].tone}>{STATE[c.state].label}</Badge>}
                />
              ))}
            </Section>
          )}
          {dormant.churches.length > 0 && (
            <Section icon={<MoonStar className="size-4" />} title={`Sin ingresos en ${dormant.days} días (${number(dormant.churches.length)})`}>
              {dormant.churches.slice(0, 5).map((c) => (
                <Row key={c.id} href={`/app/admin/iglesias/${c.id}`} title={c.name} subtitle={c.lastLoginAt ? `Último ingreso ${relative(c.lastLoginAt)}` : 'Nadie ingresó todavía'} />
              ))}
            </Section>
          )}
        </div>
      )}
    </Card>
  );
}

function TopChurchesCard({ churches }: { churches: AdminOverview['topChurches'] }) {
  const max = Math.max(...churches.map((c) => c.members), 1);
  return (
    <Card>
      <CardHeader title="Iglesias con más miembros" action={<CardLink href="/app/admin/iglesias">Ver todas</CardLink>} />
      {churches.length === 0 ? (
        <EmptyState icon={<Building2 className="size-5" />} title="Todavía no hay iglesias" />
      ) : (
        <ul className="space-y-1 p-3">
          {churches.map((c) => (
            <li key={c.id}>
              <Link href={`/app/admin/iglesias/${c.id}`} className="group block rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium group-hover:text-accent-ink">{c.name}</span>
                  <span className="tabular shrink-0 font-medium">{number(c.members)}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${Math.max(2, (c.members / max) * 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {number(c.users)} {c.users === 1 ? 'cuenta' : 'cuentas'}
                  {c.city && ` · ${c.city}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentDonationsCard({ donations }: { donations: AdminOverview['recentDonations'] }) {
  return (
    <Card>
      <CardHeader title="Últimas donaciones" action={<CardLink href="/app/admin/donaciones">Gestionar</CardLink>} />
      {donations.length === 0 ? (
        <EmptyState icon={<HeartHandshake className="size-5" />} title="Todavía no hay donaciones" description="Regístralas desde Donaciones al coordinarlas por WhatsApp." />
      ) : (
        <ul className="p-3">
          {donations.map((d) => (
            <li key={d.id}>
              <Row
                href={d.churchId ? `/app/admin/iglesias/${d.churchId}` : undefined}
                title={d.churchName}
                subtitle={`${day(d.receivedAt)} · cubre hasta el ${day(d.coversUntil)}`}
                meta={<span className="tabular font-medium text-fg">{d.amount !== null && d.currency ? money(d.amount, d.currency) : 'Sin importe'}</span>}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
