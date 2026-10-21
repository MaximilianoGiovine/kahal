'use client';

import { Input, Select } from '@/components/ui';
import { monthRange, todayISO } from '@/lib/format';

export type PeriodKey = 'month' | 'prev' | 'quarter' | 'year' | 'all' | 'custom';

export interface Period {
  key: PeriodKey;
  from?: string;
  to?: string;
}

export function resolvePeriod(key: PeriodKey, custom?: { from?: string; to?: string }): Period {
  const today = todayISO();
  switch (key) {
    case 'month':
      return { key, ...monthRange(0) };
    case 'prev':
      return { key, ...monthRange(-1) };
    case 'quarter':
      return { key, from: monthRange(-2).from, to: monthRange(0).to };
    case 'year':
      return { key, from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case 'all':
      return { key };
    case 'custom':
      return { key, from: custom?.from, to: custom?.to };
  }
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.key} onChange={(e) => onChange(resolvePeriod(e.target.value as PeriodKey, value))} aria-label="Período" className="w-44">
        <option value="month">Este mes</option>
        <option value="prev">Mes anterior</option>
        <option value="quarter">Últimos 3 meses</option>
        <option value="year">Este año</option>
        <option value="all">Todo</option>
        <option value="custom">Personalizado</option>
      </Select>
      {value.key === 'custom' && (
        <>
          <Input type="date" value={value.from ?? ''} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label="Desde" className="w-40" />
          <span className="text-sm text-muted">a</span>
          <Input type="date" value={value.to ?? ''} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label="Hasta" className="w-40" />
        </>
      )}
    </div>
  );
}
