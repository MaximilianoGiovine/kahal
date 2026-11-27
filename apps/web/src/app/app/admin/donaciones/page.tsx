'use client';

import { useQuery } from '@tanstack/react-query';
import { Ban, CheckCircle2, Clock, Hourglass, HeartHandshake, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Card, EmptyState, ErrorState, Input, Loading, PageHeader, Stat, Tabs, td, th } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, money, number } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Currency } from '@/lib/types';
import { ManageDonations } from './manage';
import { STATE, type AdminBilling, type AdminBillingChurch, type AdminBillingState } from './types';

const day = (iso: string | null | undefined) => dateTime(iso, { dateStyle: 'medium' });

type Filter = 'all' | 'attention' | 'PENDING' | 'ACTIVE' | 'EXEMPT';
const ATTENTION: AdminBillingState[] = ['EXPIRED', 'DUE'];
const ORDER: AdminBillingState[] = ['PENDING', 'EXPIRED', 'DUE', 'ACTIVE', 'EXEMPT', 'CLOSING'];

export default function AdminDonationsPage() {
  const { isSuperAdmin } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [managing, setManaging] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'billing'],
    queryFn: () => api<AdminBilling>('/admin/billing'),
    enabled: isSuperAdmin,
  });

  const count = (states: AdminBillingState[]) => data?.churches.filter((c) => states.includes(c.state)).length ?? 0;
  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.churches
      .filter((c) => (filter === 'all' ? true : filter === 'attention' ? ATTENTION.includes(c.state) : filter === 'ACTIVE' ? c.state === 'ACTIVE' || c.state === 'DUE' : c.state === filter))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.slug.includes(q) || c.city?.toLowerCase().includes(q))
      .sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || a.name.localeCompare(b.name));
  }, [data, filter, search]);
  const selected = data?.churches.find((c) => c.id === managing) ?? null;

  if (!isSuperAdmin) return <ErrorState error={new Error('Solo disponible para super administradores')} />;

  const monthly = Object.entries(data?.monthly ?? {}) as [Currency, number][];

  return (
    <>
      <PageHeader title="Donaciones" description="La activación de cada iglesia. Registra aquí las donaciones que coordinas por WhatsApp para activarlas o extender su plazo." />
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={<Hourglass />} label="Sin activar" value={number(count(['PENDING']))} hint="Esperan coordinar su donación" />
            <Stat icon={<CheckCircle2 />} label="Activas" value={number(count(['ACTIVE', 'DUE']))} hint={`de ${number(data.churches.length)} iglesias`} />
            <Stat icon={<Ban />} label="Requieren atención" value={number(count(ATTENTION))} hint="Vencidas o por vencer" />
            <Stat
              icon={<HeartHandshake />}
              label="Donado este mes"
              value={monthly.length ? monthly.map(([cur, v]) => money(v, cur)).join(' · ') : '—'}
              hint="Suma de las donaciones registradas"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Tabs
              value={filter}
              onChange={setFilter}
              items={[
                { value: 'all', label: 'Todas' },
                { value: 'PENDING', label: `Sin activar (${count(['PENDING'])})` },
                { value: 'attention', label: `Atención (${count(ATTENTION)})` },
                { value: 'ACTIVE', label: 'Activas' },
                { value: 'EXEMPT', label: 'Exentas' },
              ]}
            />
            <div className="relative w-full sm:ml-auto sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar iglesia" className="pl-9" aria-label="Buscar iglesia" />
            </div>
          </div>

          <Card>
            {rows.length === 0 ? (
              <EmptyState icon={<HeartHandshake className="size-5" />} title="No hay iglesias en esta vista" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={th}>Iglesia</th>
                      <th className={th}>Estado</th>
                      <th className={th}>Última donación</th>
                      <th className={th}>Vencimiento</th>
                      <th className={th} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((c) => (
                      <tr key={c.id} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setManaging(c.id)}>
                        <td className={td}>
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted">
                            /{c.slug}
                            {c.city && ` · ${c.city}`}
                          </p>
                        </td>
                        <td className={td}>
                          <Badge tone={STATE[c.state].tone}>{STATE[c.state].label}</Badge>
                          {c.state === 'EXEMPT' && c.billingExemptNote && <p className="mt-1 max-w-56 truncate text-xs text-muted">{c.billingExemptNote}</p>}
                        </td>
                        <td className={`${td} tabular`}>
                          {c.lastDonation ? (
                            <>
                              {c.lastDonation.amount !== null && c.lastDonation.currency ? money(c.lastDonation.amount, c.lastDonation.currency) : 'Sin importe'}
                              <span className="block text-xs text-muted">{day(c.lastDonation.receivedAt)}</span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={`${td} text-muted`}>
                          <DueCell church={c} />
                        </td>
                        <td className={`${td} text-right`}>
                          <button type="button" className="text-sm font-medium text-accent-ink hover:underline" onClick={() => setManaging(c.id)}>
                            Gestionar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
      {selected && <ManageDonations church={selected} onClose={() => setManaging(null)} />}
    </>
  );
}

function DueCell({ church: c }: { church: AdminBillingChurch }) {
  if (c.state === 'CLOSING' && c.deletionScheduledFor) return <>Se borra el {day(c.deletionScheduledFor)}</>;
  if (!c.access.until) return <>—</>;
  if (c.state === 'EXPIRED') return <span className="text-danger">Venció el {day(c.access.until)}</span>;
  if (c.state === 'DUE')
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <Clock className="size-3.5" /> Vence el {day(c.access.until)}
      </span>
    );
  return <>Activa hasta el {day(c.access.until)}</>;
}
