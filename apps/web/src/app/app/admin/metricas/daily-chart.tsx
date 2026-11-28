'use client';

import { BarChart } from '@/components/bar-chart';
import { dayLabel, dayMonth } from '@/lib/format';

export interface DayPoint {
  day: string;
  count: number;
}

/** Registros por día: una sola serie, tooltip por día y vista de tabla. */
export function DailyChart({ data }: { data: DayPoint[] }) {
  return (
    <BarChart
      data={data.map((d) => ({ key: d.day, value: d.count, tick: dayMonth(d.day), title: dayLabel(d.day) }))}
      seriesLabel="Registros"
      ariaLabel="Nuevos registros por día"
      periodLabel="Día"
    />
  );
}
