'use client';

import { useEffect, useRef, useState } from 'react';
import { Tabs } from '@/components/ui';
import { dayLabel, dayMonth, number } from '@/lib/format';

export interface DayPoint {
  day: string;
  count: number;
}

const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 36 };

/** Paso del eje en números enteros: no existe media persona. */
function niceStep(max: number) {
  const rough = Math.max(1, max / 4);
  const exp = 10 ** Math.floor(Math.log10(rough));
  const n = rough / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
}

/** Registros por día: una sola serie, tooltip por día y vista de tabla. */
export function DailyChart({ data }: { data: DayPoint[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const peak = Math.max(...data.map((d) => d.count), 1);
  const step = niceStep(peak);
  const max = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, data.length);
  const barW = Math.max(1.5, Math.min(18, band - 2));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  // Se etiquetan solo los días que entran sin encimarse, contando desde el último.
  const labelEvery = Math.max(1, Math.ceil(52 / band));
  const hovered = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-3 flex justify-end">
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
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted uppercase">
                <th className="py-2 pr-4 font-medium">Día</th>
                <th className="py-2 text-right font-medium">Registros</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-border">
              {[...data].reverse().map((d) => (
                <tr key={d.day}>
                  <td className="py-2 pr-4">{dayLabel(d.day)}</td>
                  <td className="py-2 text-right">{number(d.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={H} role="img" aria-label="Nuevos registros por día" className="block">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-[var(--subtle)] text-[11px]">
                  {number(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = PAD.left + band * i + band / 2;
              const h = PAD.top + innerH - y(d.count);
              const top = y(d.count);
              const r = Math.min(4, barW / 2, h);
              const x = cx - barW / 2;
              return (
                <g key={d.day}>
                  {hover === i && <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="var(--surface-2)" />}
                  {h > 0 && (
                    <path d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`} fill="var(--series-1)" />
                  )}
                  {(data.length - 1 - i) % labelEvery === 0 && (
                    <text x={cx} y={H - 8} textAnchor="middle" className="fill-[var(--muted)] text-[11px]">
                      {dayMonth(d.day)}
                    </text>
                  )}
                  <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH + PAD.bottom} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
                </g>
              );
            })}
            <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeWidth={1} />
          </svg>
          {hovered && hover !== null && (
            <div
              className="glass-strong pointer-events-none absolute top-2 z-10 w-44 rounded-xl p-3 text-sm"
              style={{ left: Math.min(Math.max(PAD.left + band * hover + band / 2 - 88, 0), width - 176) }}
            >
              <p className="mb-2 font-medium">{dayLabel(hovered.day)}</p>
              <div className="tabular flex justify-between gap-3">
                <span className="text-muted">Registros</span>
                <span>{number(hovered.count)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
