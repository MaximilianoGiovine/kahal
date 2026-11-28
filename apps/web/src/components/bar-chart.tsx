'use client';

import { useEffect, useRef, useState } from 'react';
import { Tabs } from '@/components/ui';
import { number } from '@/lib/format';

export interface BarPoint {
  key: string;
  value: number;
  /** Etiqueta corta del eje. */
  tick: string;
  /** Encabezado del tooltip y de la fila de la tabla. */
  title: string;
  /** Líneas extra del tooltip, por ejemplo importes por moneda. */
  detail?: { label: string; value: string }[];
}

const PAD = { top: 12, right: 8, bottom: 28, left: 36 };
const TIP_W = 192;

/** Paso del eje en números enteros: no existen medias personas ni medias iglesias. */
function niceStep(max: number) {
  const rough = Math.max(1, max / 4);
  const exp = 10 ** Math.floor(Math.log10(rough));
  const n = rough / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
}

/** Una sola serie de barras, con tooltip por barra y vista de tabla. */
export function BarChart({
  data,
  seriesLabel,
  ariaLabel,
  periodLabel,
  height = 220,
}: {
  data: BarPoint[];
  seriesLabel: string;
  ariaLabel: string;
  /** Encabezado de la primera columna de la tabla ("Día", "Mes"). */
  periodLabel: string;
  height?: number;
}) {
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

  const H = height;
  const peak = Math.max(...data.map((d) => d.value), 1);
  const step = niceStep(peak);
  const max = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, data.length);
  const barW = Math.max(1.5, Math.min(28, band - 2));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  // Se etiquetan solo las barras que entran sin encimarse, contando desde la última.
  const labelEvery = Math.max(1, Math.ceil(52 / band));
  const lastCx = PAD.left + band * (data.length - 1) + band / 2;
  // La última etiqueta se corre hacia adentro si no entra; la anterior se omite si la pisaría.
  const lastShifted = lastCx + 24 > width;
  const showTick = (i: number, cx: number) => (data.length - 1 - i) % labelEvery === 0 && (i === data.length - 1 || !lastShifted || lastCx - cx >= 72);
  const hovered = hover !== null ? data[hover] : null;
  const hasDetail = data.some((d) => d.detail?.length);

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
                <th className="py-2 pr-4 font-medium">{periodLabel}</th>
                <th className="py-2 text-right font-medium">{seriesLabel}</th>
                {hasDetail && <th className="py-2 pl-4 text-right font-medium">Detalle</th>}
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-border">
              {[...data].reverse().map((d) => (
                <tr key={d.key}>
                  <td className="py-2 pr-4">{d.title}</td>
                  <td className="py-2 text-right">{number(d.value)}</td>
                  {hasDetail && <td className="py-2 pl-4 text-right text-muted">{d.detail?.map((r) => r.value).join(' · ') || '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={H} role="img" aria-label={ariaLabel} className="block">
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
              const top = y(d.value);
              const h = PAD.top + innerH - top;
              const r = Math.min(4, barW / 2, h);
              const x = cx - barW / 2;
              return (
                <g key={d.key}>
                  {hover === i && <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="var(--surface-2)" />}
                  {h > 0 && (
                    <path d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`} fill="var(--series-1)" />
                  )}
                  {showTick(i, cx) && (
                    // En los bordes se alinea hacia adentro para que la etiqueta no se corte.
                    <text
                      x={cx}
                      y={H - 8}
                      textAnchor={cx + 24 > width ? 'end' : cx - 24 < 0 ? 'start' : 'middle'}
                      className="fill-[var(--muted)] text-[11px]"
                    >
                      {d.tick}
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
              className="glass-strong pointer-events-none absolute top-2 z-10 rounded-xl p-3 text-sm"
              style={{ width: TIP_W, left: Math.min(Math.max(PAD.left + band * hover + band / 2 - TIP_W / 2, 0), width - TIP_W) }}
            >
              <p className="mb-2 font-medium">{hovered.title}</p>
              <div className="tabular flex justify-between gap-3">
                <span className="text-muted">{seriesLabel}</span>
                <span>{number(hovered.value)}</span>
              </div>
              {hovered.detail?.map((r) => (
                <div key={r.label} className="tabular mt-1 flex justify-between gap-3">
                  <span className="text-muted">{r.label}</span>
                  <span>{r.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
