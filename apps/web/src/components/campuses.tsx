'use client';

import { useQuery } from '@tanstack/react-query';
import { Checkbox, Field, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { CampusList } from '@/lib/types';

/** Valor de los filtros para lo que no tiene sede (igual que en la API). */
export const NO_CAMPUS = 'none';

export function useCampuses() {
  return useQuery({ queryKey: ['campuses'], queryFn: () => api<CampusList>('/campuses'), staleTime: 60_000 });
}

/** Filtro por sede. No aparece si las sedes están apagadas, ni si solo hay una para elegir. */
export function CampusFilter({ value, onChange, noneLabel, className }: { value: string; onChange: (id: string) => void; noneLabel: string; className?: string }) {
  const { me } = useSession();
  const { data } = useCampuses();
  const wholeChurch = me.campusScope === null;
  if (!data?.enabled || (!wholeChurch && data.items.length < 2)) return null;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Sede" className={className}>
      <option value="">{wholeChurch ? 'Todas las sedes' : 'Mis sedes'}</option>
      {data.items.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.active ? '' : ' (archivada)'}
        </option>
      ))}
      {wholeChurch && <option value={NO_CAMPUS}>{noneLabel}</option>}
    </Select>
  );
}

/** Campo de sede para formularios. Quien está limitado a ciertas sedes no puede dejarlo vacío. */
export function CampusField({ current, emptyLabel, hint, className }: { current?: string | null; emptyLabel: string; hint?: string; className?: string }) {
  const { me } = useSession();
  const { data } = useCampuses();
  if (!data?.enabled) return null;
  const options = data.items.filter((c) => c.active || c.id === current);
  const wholeChurch = me.campusScope === null;
  const initial = current ?? (!wholeChurch && options.length === 1 ? options[0].id : '');
  return (
    <Field label="Sede" hint={hint} className={className}>
      <Select name="campusId" defaultValue={initial} required={!wholeChurch} key={options.length}>
        <option value="" disabled={!wholeChurch}>
          {wholeChurch ? emptyLabel : 'Elige una sede'}
        </option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Limita lo que un usuario ve de miembros y finanzas. */
export function CampusAccessPicker({
  restricted,
  campusIds,
  onChange,
}: {
  restricted: boolean;
  campusIds: string[];
  onChange: (next: { restricted: boolean; campusIds: string[] }) => void;
}) {
  const { data } = useCampuses();
  if (!data?.enabled) return null;
  return (
    <fieldset className="grid gap-2.5">
      <legend className="mb-2 text-sm font-medium">Acceso por sede</legend>
      <Checkbox
        checked={restricted}
        onChange={(e) => onChange({ restricted: e.target.checked, campusIds })}
        label={
          <>
            <span className="font-medium">Limitar a ciertas sedes</span>
            <span className="block text-xs text-muted">
              Solo verá los miembros y las finanzas de esas sedes, y pierde lo que afecta a toda la iglesia: datos de la iglesia, usuarios, roles y estados. No aplica al rol de administración.
            </span>
          </>
        }
      />
      {restricted && (
        <div className="grid gap-2 pl-6 sm:grid-cols-2">
          {data.items.map((c) => (
            <Checkbox
              key={c.id}
              checked={campusIds.includes(c.id)}
              onChange={(e) => onChange({ restricted, campusIds: e.target.checked ? [...campusIds, c.id] : campusIds.filter((id) => id !== c.id) })}
              label={`${c.name}${c.active ? '' : ' (archivada)'}`}
            />
          ))}
          {data.items.length === 0 && <p className="text-sm text-muted">Todavía no hay sedes creadas.</p>}
        </div>
      )}
    </fieldset>
  );
}
