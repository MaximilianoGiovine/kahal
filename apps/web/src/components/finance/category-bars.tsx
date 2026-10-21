import { money } from '@/lib/format';
import type { Currency } from '@/lib/types';

/** Barras horizontales por categoría (un solo color: la identidad la da la etiqueta). */
export function CategoryBars({ items, currency, color }: { items: { name: string; total: number; count: number }[]; currency: Currency; color: string }) {
  const total = items.reduce((s, i) => s + i.total, 0);
  const max = Math.max(...items.map((i) => i.total), 1);
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">Sin movimientos en el período.</p>;
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.name} title={`${i.count} movimientos`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{i.name}</span>
            <span className="tabular shrink-0 text-muted">
              {money(i.total, currency)} <span className="text-xs text-subtle">· {Math.round((i.total / total) * 100)}%</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(1, (i.total / max) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
