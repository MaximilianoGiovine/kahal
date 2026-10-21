'use client';

import { useEffect, useRef, useState } from 'react';
import { Tabs } from '@/components/ui';
import { money, monthLabel } from '@/lib/format';
import type { Currency } from '@/lib/types';

export interface MonthPoint {
  month: string;
  income: number;
  expense: number;
}

const H = 240;
const PAD = { top: 12, right: 8, bottom: 28, left: 56 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const n = v / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * exp;
}

/** Barras agrupadas ingresos/egresos por mes. Un solo eje, tooltip por mes y vista de tabla. */
export function MonthlyChart({ data, currency }: { data: MonthPoint[]; currency: Currency }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const max = niceMax(Math.max(...data.flatMap((d) => [d.income, d.expense]), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, data.length);
  const gap = 2;
  const barW = Math.max(3, Math.min(22, (band * 0.62 - gap) / 2));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const compact = (v: number) => money(v, currency, { compact: true });
  const labelEvery = band < 34 ? 2 : 1;

  const bar = (x: number, v: number, color: string) => {
    const h = Math.max(0, PAD.top + innerH - y(v));
    if (h <= 0) return null;
    const r = Math.min(4, barW / 2, h);
    const top = y(v);
    // Solo las esquinas superiores redondeadas: la barra queda anclada a la base.
    return (
      <path
        d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`}
        fill={color}
      />
    );
  };

  const hovered = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm text-muted" aria-label="Leyenda">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-series-1" /> Ingresos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-series-2" /> Egresos
          </span>
        </div>
        <Tabs
          value={view}
          onChange={setView}
          items={[
            { value: 'chart', label: 'Gráfico' },
            { value: 'table', label: 'Tabla' },
          ]}
        />
      </div>

      {view === 'table' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted uppercase">
                <th className="py-2 pr-4 font-medium">Mes</th>
                <th className="py-2 pr-4 text-right font-medium">Ingresos</th>
                <th className="py-2 pr-4 text-right font-medium">Egresos</th>
                <th className="py-2 text-right font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-border">
              {data.map((d) => (
                <tr key={d.month}>
                  <td className="py-2 pr-4 capitalize">{monthLabel(d.month, 'long')}</td>
                  <td className="py-2 pr-4 text-right">{money(d.income, currency)}</td>
                  <td className="py-2 pr-4 text-right">{money(d.expense, currency)}</td>
                  <td className={`py-2 text-right font-medium ${d.income - d.expense < 0 ? 'text-danger' : ''}`}>{money(d.income - d.expense, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={H} role="img" aria-label={`Ingresos y egresos por mes en ${currency}`} className="block">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--subtle)] text-[11px] tabular">
                  {compact(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = PAD.left + band * i + band / 2;
              const x1 = cx - barW - gap / 2;
              const x2 = cx + gap / 2;
              return (
                <g key={d.month}>
                  {hover === i && <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="var(--surface-2)" />}
                  {bar(x1, d.income, 'var(--series-1)')}
                  {bar(x2, d.expense, 'var(--series-2)')}
                  {i % labelEvery === 0 && (
                    <text x={cx} y={H - 8} textAnchor="middle" className="fill-[var(--muted)] text-[11px] capitalize">
                      {monthLabel(d.month).replace('.', '')}
                    </text>
                  )}
                  {/* Zona de hover más grande que las barras */}
                  <rect
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={innerH + PAD.bottom}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onTouchStart={() => setHover(i)}
                  />
                </g>
              );
            })}
            <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeWidth={1} />
          </svg>
          {hovered && hover !== null && (
            <div
              className="pointer-events-none absolute top-2 z-10 w-52 rounded-lg border border-border bg-surface p-3 text-sm shadow-lg"
              style={{ left: Math.min(Math.max(PAD.left + band * hover + band / 2 - 104, 0), width - 208) }}
            >
              <p className="mb-2 font-medium capitalize">{monthLabel(hovered.month, 'long')}</p>
              <div className="tabular space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted">
                    <span className="size-2 rounded-sm bg-series-1" /> Ingresos
                  </span>
                  <span>{money(hovered.income, currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted">
                    <span className="size-2 rounded-sm bg-series-2" /> Egresos
                  </span>
                  <span>{money(hovered.expense, currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-1 font-medium">
                  <span>Resultado</span>
                  <span>{money(hovered.income - hovered.expense, currency)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
