'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays, TrendingUp, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Card, CardHeader, ErrorState, Loading, PageHeader, Select, Stat, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { number } from '@/lib/format';
import { useSession } from '@/lib/session';
import { DailyChart, type DayPoint } from './daily-chart';

interface Registrations {
  days: number;
  current: number;
  previous: number;
  before: number;
  daily: DayPoint[];
}

const PERIODS = ['7', '30', '90'] as const;
type Period = (typeof PERIODS)[number];

const decimal = (n: number) => n.toLocaleString('es-419', { maximumFractionDigits: 1 });

export default function RegistrationsPage() {
  const { isSuperAdmin, churches } = useSession();
  const [period, setPeriod] = useState<Period>('30');
  const [churchId, setChurchId] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'registrations', period, churchId],
    queryFn: () => api<Registrations>('/admin/registrations', { query: { days: period, churchId } }),
    enabled: isSuperAdmin,
    placeholderData: (previous) => previous,
  });

  if (!isSuperAdmin) return <ErrorState error={new Error('Solo disponible para super administradores')} />;

  return (
    <>
      <PageHeader title="Nuevos registros" description="Cuentas creadas en Kahal, incluidas las que todavía esperan aprobación." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <Select value={churchId} onChange={(e) => setChurchId(e.target.value)} aria-label="Iglesia">
            <option value="">Todas las iglesias</option>
            {churches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <Tabs value={period} onChange={setPeriod} items={PERIODS.map((p) => ({ value: p, label: `${p} días` }))} />
      </div>
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat icon={<UserPlus />} label={`Registros en ${data.days} días`} value={number(data.current)} hint={`${number(data.previous)} en los ${data.days} días anteriores`} />
            <Stat icon={<CalendarDays />} label="Promedio por día" value={decimal(data.current / data.days)} />
            <Stat
              icon={<TrendingUp />}
              label="Tasa de crecimiento"
              value={data.before > 0 ? `${decimal((data.current / data.before) * 100)} %` : '—'}
              hint={data.before > 0 ? `Sobre ${number(data.before)} ${data.before === 1 ? 'cuenta previa' : 'cuentas previas'}` : 'Sin cuentas previas para comparar'}
            />
          </div>
          <Card>
            <CardHeader title="Registros por día" description="Días según la zona horaria de cada iglesia." />
            <div className="p-5">
              <DailyChart data={data.daily} />
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
