'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Download, Landmark, Scale } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CategoryBars } from '@/components/finance/category-bars';
import { MonthlyChart, type MonthPoint } from '@/components/finance/monthly-chart';
import { PeriodPicker, resolvePeriod, type Period } from '@/components/finance/period';
import { Button, Card, CardHeader, ErrorState, Loading, Stat, Tabs } from '@/components/ui';
import { api, download } from '@/lib/api';
import { money } from '@/lib/format';
import type { Currency, FinanceSummary } from '@/lib/types';

export default function FinanceSummaryPage() {
  const [period, setPeriod] = useState<Period>(() => resolvePeriod('month'));
  const [currency, setCurrency] = useState<Currency>('ARS');
  const [exporting, setExporting] = useState(false);

  const range = { from: period.from, to: period.to };
  const summary = useQuery({
    queryKey: ['finance', 'summary', range],
    queryFn: () => api<FinanceSummary>('/finance/summary', { query: range }),
    placeholderData: (p) => p,
  });
  // El gráfico mensual siempre muestra los últimos 12 meses.
  const yearly = useQuery({ queryKey: ['finance', 'summary', 'last12'], queryFn: () => api<FinanceSummary>('/finance/summary') });

  const monthly = useMemo<MonthPoint[]>(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11 + i, 1));
      return d.toISOString().slice(0, 7);
    });
    return months.map((month) => {
      const rows = yearly.data?.monthly.filter((r) => r.month === month && r.currency === currency) ?? [];
      return {
        month,
        income: Number(rows.find((r) => r.type === 'INCOME')?.total ?? 0),
        expense: Number(rows.find((r) => r.type === 'EXPENSE')?.total ?? 0),
      };
    });
  }, [yearly.data, currency]);

  async function exportXlsx() {
    setExporting(true);
    try {
      await download('/finance/export', range);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  }

  if (summary.isLoading) return <Loading />;
  if (summary.error || !summary.data) return <ErrorState error={summary.error} onRetry={summary.refetch} />;

  const s = summary.data;
  const t = s.totals[currency] ?? { income: '0', expense: '0', net: '0' };
  const cats = (type: 'INCOME' | 'EXPENSE') =>
    s.byCategory.filter((c) => c.currency === currency && c.type === type).map((c) => ({ name: c.name, total: Number(c.total), count: c.count }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker value={period} onChange={setPeriod} />
          <Tabs
            value={currency}
            onChange={setCurrency}
            items={[
              { value: 'ARS', label: 'ARS' },
              { value: 'USD', label: 'USD' },
            ]}
          />
        </div>
        <Button variant="secondary" onClick={exportXlsx} loading={exporting}>
          <Download className="size-4" /> Exportar a Excel
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Ingresos" value={money(t.income, currency)} icon={<ArrowUpRight className="size-4 text-series-1" />} />
        <Stat label="Egresos" value={money(t.expense, currency)} icon={<ArrowDownRight className="size-4 text-series-2" />} />
        <Stat
          label="Resultado"
          value={<span className={Number(t.net) < 0 ? 'text-danger' : ''}>{money(t.net, currency)}</span>}
          hint={Number(t.net) < 0 ? 'Los egresos superan a los ingresos' : 'Superávit del período'}
          icon={<Scale className="size-4" />}
        />
      </div>

      <Card>
        <CardHeader title="Últimos 12 meses" description={`Ingresos y egresos mensuales en ${currency}`} />
        <div className="p-5">{yearly.isLoading ? <Loading /> : <MonthlyChart data={monthly} currency={currency} />}</div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Ingresos por categoría" />
          <div className="p-5">
            <CategoryBars items={cats('INCOME')} currency={currency} color="var(--series-1)" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Egresos por categoría" />
          <div className="p-5">
            <CategoryBars items={cats('EXPENSE')} currency={currency} color="var(--series-2)" />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Saldos por cuenta" description="Saldo actual: saldo inicial más todos los movimientos." />
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {s.accounts
            .filter((a) => a.active)
            .map((a) => (
              <div key={a.id} className="flex items-center gap-3 bg-surface p-5">
                <span className="rounded-lg bg-surface-2 p-2 text-muted">
                  <Landmark className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-muted">{a.name}</p>
                  <p className={`tabular text-lg font-semibold ${Number(a.balance) < 0 ? 'text-danger' : ''}`}>{money(a.balance, a.currency)}</p>
                </div>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
