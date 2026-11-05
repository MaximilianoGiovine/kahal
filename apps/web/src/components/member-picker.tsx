'use client';

import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui';
import { api } from '@/lib/api';

type Pick = { id: string; firstName: string; lastName: string };

/** Buscador de miembros con autocompletado. Guarda el id en un input hidden. */
export function MemberPicker({ name, initial }: { name: string; initial?: Pick | null }) {
  const [selected, setSelected] = useState<Pick | null>(initial ?? null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const query = useDeferredValue(q);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['members', 'picker', query],
    queryFn: () => api<(Pick & { documentId: string | null })[]>('/members/lookup', { query: { q: query } }),
    enabled: open && query.length >= 2,
  });

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ''} />
      {selected ? (
        <div className="flex h-10 items-center justify-between rounded-lg border border-border bg-surface-2 px-3 text-sm">
          <span>
            {selected.lastName}, {selected.firstName}
          </span>
          <button type="button" onClick={() => setSelected(null)} className="text-muted hover:text-fg" aria-label="Quitar miembro">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <>
          <Search className="pointer-events-none absolute top-3 left-3 size-4 text-subtle" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar miembro (opcional)"
            className="pl-9"
            aria-label="Buscar miembro"
          />
          {open && query.length >= 2 && (
            <ul className="glass-strong absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl p-1">
              {!data?.length && <li className="px-3 py-2 text-sm text-muted">Sin resultados</li>}
              {data?.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(m);
                      setOpen(false);
                      setQ('');
                    }}
                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    {m.lastName}, {m.firstName}
                    {m.documentId && <span className="ml-2 text-xs text-muted">Documento {m.documentId}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
